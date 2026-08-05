# Common SMART on FHIR Errors

Causes and fixes for the errors you'll actually hit integrating SMART on
FHIR — grounded in this library's typed error classes (`src/errors.ts`)
plus real failures reproduced against Epic, Cerner, and SMART Health IT
during development (see [vendor-notes.md](./vendor-notes.md) and
[PRODUCTION_GUIDE.md](./PRODUCTION_GUIDE.md) for the vendor-specific
incident detail behind several of these).

---

## redirect_uri mismatch

**Symptom:** the authorization server rejects the request before showing
a login screen — often with a generic message (Epic: "Invalid OAuth 2.0
request", no further detail).

**Cause:** OAuth2 requires the `redirect_uri` sent in the authorization
request to match a registered value *exactly* — scheme, host, port, and
path. Every vendor tested enforces this strictly.

**Fix:** compare `config.redirectUri` character-for-character against
what's registered in the vendor's app console. Check the port
specifically — `http://localhost:3000/callback` and
`http://localhost:3001/callback` are different registrations, and a
generic error page won't tell you which check failed.

**Library behavior:** `buildEhrAuthorizationRequest`/
`buildStandaloneAuthorizationRequest` send whatever `redirectUri` you
configured, unmodified — there's no client-side validation against a
registered list, because the library has no way to know what's
registered. This is always a config-vs-console mismatch, not a code bug.

---

## invalid_grant

**Symptom:** token exchange fails after a successful login/redirect.

**Cause:** the token endpoint rejected the authorization code — typically
an expired code (authorization codes are short-lived, often ~1-5
minutes), a code already used once (single-use), or a `code_verifier`
that doesn't match the `code_challenge` sent earlier.

**Fix:** ensure the callback is handled promptly (don't let a code sit in
a queue), and confirm you're not double-processing the same callback
(e.g. a page reload re-submitting the same `code`).

**Library behavior:** surfaces as `TokenExchangeError` with
`.error === "invalid_grant"`. Never retried silently — see
`tests/token.test.ts` for the exact behavior under this condition.

```ts
try {
  await handleEhrCallback(callbackParams, pending, config);
} catch (err) {
  if (err instanceof TokenExchangeError && err.error === "invalid_grant") {
    // Show "your session expired, please launch again" — not a bug to retry.
  }
}
```

---

## PKCE verification failed

**Symptom:** token exchange fails even though the authorization step
succeeded.

**Cause:** the `code_verifier` sent to the token endpoint doesn't hash
(SHA-256, base64url) to the `code_challenge` sent at the authorize step —
usually because the `PendingLaunch` object (which carries `codeVerifier`)
was lost or replaced between the redirect and the callback (wrong session,
expired cache entry, multiple concurrent launches sharing a key).

**Fix:** verify your `PendingLaunch` persistence survives the full
redirect round-trip and is keyed uniquely per launch attempt — see
[PRODUCTION_GUIDE.md §3](./PRODUCTION_GUIDE.md#3-where-does-pendinglaunch-live-between-redirect-and-callback).

**Library behavior:** this library only generates S256 challenges
(`pkce.ts`) and never implements the `plain` method — the verification
itself happens server-side at the vendor's token endpoint, surfacing here
as a `TokenExchangeError`, not a distinct local error. `PkceValidationError`
exists for anyone building a mock authorization server for tests, not for
normal client-side usage.

---

## launch parameter missing

**Symptom:** the app fails immediately, before any redirect happens.

**Cause:** an EHR launch was started without a valid `iss` and/or `launch`
query parameter — e.g. the app was opened directly rather than launched
from within an EHR session or a sandbox launcher.

**Fix:** confirm the app is being opened via the correct entry point (an
EHR's launch mechanism, or the SMART Health IT sandbox picker pointed at
`/launch`) rather than navigated to directly.

**Library behavior:** `buildEhrAuthorizationRequest` throws
`MissingLaunchParameterError` **before any network call or redirect** —
verified in `tests/launch/ehr.test.ts` ("fails fast on a missing iss/launch,
before any network call"). Nothing leaks; the failure is immediate and
local.

---

## invalid scope

**Symptom:** the authorization server rejects the request, sometimes
silently dropping the offending scope from what it grants rather than
erroring outright (observed with Epic).

**Cause:** almost always a **SMART scope version mismatch** — v1 wildcard
syntax (`patient/*.read`) sent to an app registered for SMART v2, which
requires fine-grained scopes (`patient/Patient.rs`) instead. Can also be
a resource type the app was never pre-approved for in the vendor's
console, regardless of syntax.

**Fix:** confirm the app's registered SMART Scope Version before picking
a scope string (see [vendor-notes.md](./vendor-notes.md) — this is
Epic-specific behavior we hit directly). Read the actual `scope` field
back from the token response (`token.scope`) rather than assuming what
you requested is what you got — vendors don't always echo the request.

**Library behavior:** `LaunchConfig.scopes` is always caller-supplied
(FR5 — no hardcoded assumptions); the library sends exactly what you
configure and does not validate scope syntax, since correct syntax is
vendor- and version-dependent, not something the library can know.

---

## issuer mismatch

**Symptom:** `DiscoveryError`, or a token that the FHIR server later
rejects as being for the wrong audience.

**Cause:** the `iss` used for discovery doesn't match the `aud` value the
authorization server expects, or `iss` has a trailing slash / different
casing than the server's canonical form.

**Fix:** use the `iss` exactly as provided by the EHR (for EHR launch) or
exactly as documented by the vendor (for standalone) — don't
normalize/rewrite it yourself. `discover()` strips a trailing slash
before building the well-known URL, but doesn't otherwise alter `iss`.

**Library behavior:** `discover()` throws `DiscoveryError` with both the
`.well-known/smart-configuration` failure and the CapabilityStatement
fallback failure attached as `cause`, so you can see exactly what was
tried — see `tests/discovery.test.ts`.

---

## patient context missing

**Symptom:** `token.context.patient` is `undefined` after a successful
launch — no error, just absent data.

**Cause:** this is very often **not a bug**. Launch context claims
(`patient`, `encounter`, `fhirUser`, etc.) are optional per the SMART App
Launch spec, and standalone launches in particular may never populate
some of them depending on the vendor and persona. We observed both Epic
and Cerner omit `fhirUser` on standalone launches while correctly
populating `patient` on EHR launches, in the same session, against
production-grade sandboxes.

**Fix:** always treat every field on `token.context` as possibly absent —
never assume `patient` exists just because the launch "succeeded" (a
successful token exchange and a populated context are two different
things). If a specific claim is required for your app to function, check
for it explicitly and prompt for re-launch/context-selection if missing,
rather than crashing.

**Library behavior:** `parseLaunchContext` (`context.ts`) is built
specifically to tolerate absence — every claim is read with a type guard
and left `undefined` rather than assumed, tested explicitly in
`tests/context.test.ts` ("does not throw and returns an empty object
when no optional claims are present").
