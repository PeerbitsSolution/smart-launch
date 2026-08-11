# Production Guide

This guide covers what the [README](../README.md) Quick Start doesn't:
running `smart-launch` in a real application, against real EHR
vendors, in production. Everything here reflects either the library's
actual implemented behavior or launch flows verified live against public
sandboxes (SMART Health IT, Epic, Cerner/Oracle Health) during
development — not assumptions about how vendors are "supposed to" behave.

## 1. What this library does and doesn't do for you

It implements: discovery, PKCE (S256), the EHR and standalone launch
redirects, authorization-code-for-token exchange, refresh, and typed
launch-context parsing.

It deliberately does **not** ship: a production token store, a session
store, retry/backoff policies, or telemetry. Those are your application's
responsibility — the library gives you the interfaces (`TokenStorage`,
the `PendingLaunch` shape) and gets out of the way.

## 2. Replacing `InMemoryTokenStorage`

`InMemoryTokenStorage` (`src/storage.ts`) exists for the examples and
tests only — tokens vanish on process restart and aren't shared across
instances. For production, implement `TokenStorage` against whatever
you already run:

```ts
import type { TokenStorage, StoredToken } from "@peerbits/smart-launch";

class RedisTokenStorage implements TokenStorage {
  constructor(private redis: RedisClient) {}

  async get(key: string): Promise<StoredToken | undefined> {
    const raw = await this.redis.get(`smart-token:${key}`);
    return raw ? JSON.parse(raw) : undefined;
  }

  async set(key: string, token: StoredToken): Promise<void> {
    // Expire slightly after the token itself so a late refresh
    // attempt still finds the refresh_token.
    const ttlSeconds = token.expiresAt
      ? Math.ceil((token.expiresAt - Date.now()) / 1000) + 3600
      : undefined;
    await this.redis.set(`smart-token:${key}`, JSON.stringify(token), { EX: ttlSeconds });
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(`smart-token:${key}`);
  }
}
```

Whatever backend you choose (Redis, Postgres, an encrypted session
column): **encrypt at rest** if the store is shared infrastructure —
`access_token`/`refresh_token` are bearer credentials to the patient's
or provider's clinical data. This library does not encrypt them for
you; the interface just moves bytes.

## 3. Where does `PendingLaunch` live between redirect and callback?

`buildEhrAuthorizationRequest`/`buildStandaloneAuthorizationRequest`
return a `pending: PendingLaunch` object (`state`, `codeVerifier`, `iss`,
`tokenEndpoint`, `redirectUri`, optional `launch`) that your app must
persist somewhere between the redirect and the callback, then hand back
to `handleEhrCallback`/`handleStandaloneCallback`.

The example apps (`docs/examples/*/server.ts`) use a plain in-process
`Map` keyed by `state` — fine for a demo, wrong for production:

- It doesn't survive a process restart or a second instance behind a
  load balancer.
- Nothing evicts stale entries — an abandoned launch leaks memory
  forever.

In production, use a real session store (signed cookie session,
Redis-backed session, etc.) scoped to the user's browser session, with
a short TTL (a few minutes — a launch that hasn't completed by then
should be considered abandoned). Do not put `PendingLaunch` in a
database table keyed by something guessable; `state` is already your
CSRF token, treat it with the same care as a CSRF token anywhere else
in your app.

## 4. Error handling reference

Every error the library throws extends `SmartLaunchError`. Catch the
specific subclass, not the message string:

| Error | Thrown when | Recommended handling |
|---|---|---|
| `MissingLaunchParameterError` | Required param (`iss`, `launch`, `code`) missing before a redirect or during callback | 400 to the user; this fires *before* any redirect, so nothing has leaked |
| `DiscoveryError` | Both `.well-known/smart-configuration` and the CapabilityStatement fallback failed | Surface a "can't reach this FHIR server" error; log the `cause` field for diagnostics |
| `StateMismatchError` | Callback `state` doesn't match the persisted `pending.state` | **Never** proceed to token exchange (the library already refuses to) — treat as a potential CSRF attempt, log it, show a generic error |
| `TokenExchangeError` | Token endpoint returned an OAuth2 error (`error`/`error_description` fields populated) | Branch on `.error` (e.g. `invalid_grant`, `access_denied`) rather than parsing `.message` |
| `RefreshFailedError` | No token stored for the key, or refresh_token was rejected/expired | Re-trigger the launch flow from scratch — there's no recovery path other than a fresh authorization |
| `PkceValidationError` | Exposed for anyone building a mock/test authorization server; the library itself never fails PKCE validation locally (that check happens server-side, surfacing as `TokenExchangeError`) | N/A in normal client usage |

## 5. Refreshing tokens in production

Don't call `refreshAccessToken` on a timer yourself — use
`ensureFreshToken`, which checks expiry (with a configurable skew) and
only calls the token endpoint when actually needed:

```ts
const token = await ensureFreshToken(config, pending.tokenEndpoint, tokenStorage, sessionKey, {
  onRefresh: async (refreshed) => {
    // Called only when a refresh actually happened — persist,
    // emit metrics, whatever your app needs.
    await auditLog.record("token_refreshed", { sessionKey });
  },
});
```

Call this at the start of every request that needs to call the FHIR
API, not on a background timer — it's cheap when the token is still
fresh (no network call at all) and correct when it isn't.

## 6. Security checklist before going live

- **`redirect_uri` must be HTTPS in production** (localhost HTTP is fine
  for local dev only — every vendor sandbox we tested enforces an exact
  string match against what's registered, scheme included).
- **PKCE is always S256** — this library never implements `plain`, and
  there's no config flag to downgrade it.
- **`state` is validated before token exchange, always** — this isn't
  optional or bypassable through configuration.
- **No default client credentials** — `LaunchConfig.clientId` has no
  fallback in the core library (only the example apps default to
  `YOUR_CLIENT_ID_HERE` for local testing). Production config must come
  from your secret manager, never hardcoded.
- **Confidential clients**: this library only supports a plain
  `client_secret` in the token request body (`config.clientSecret`). It
  does **not** implement `private_key_jwt` / JWT-assertion client
  authentication. If your vendor registration requires that (Epic's
  "confidential client" + JWK Set configuration does), this library
  cannot complete that token exchange as-is — that's a real gap, not a
  configuration issue, and would need new code in `token.ts` to support.

## 7. Sandbox vs. production

There is no `environment: "sandbox" | "production"` flag anywhere in
this library, and that's intentional, not an oversight. Per FR5 in the
build spec, `LaunchConfig` is fully caller-supplied with no defaults
that resemble a real value — the library has no concept of "environment"
to begin with. Discovery (`discover()`) just hits whatever `iss` you
give it; nothing about it is sandbox-aware or production-aware.

Sandbox and production are just **two different `LaunchConfig` values**
for the same vendor — a different `iss` (FHIR base URL), a different
`client_id`, and usually a different `client_secret`. This is how every
vendor we tested actually models it: Epic's own app console has
separate "Client ID" (production) and "Non-Production Client ID"
(sandbox) fields with independent secrets; Cerner and SMART Health IT
follow the same pattern of environment-scoped credentials tied to
environment-scoped FHIR base URLs.

The right place to manage that split is your application's own config
loading, not this library:

```ts
// Pick config by deployment environment — plain application code,
// nothing SMART-specific about this part.
const config: LaunchConfig =
  process.env.DEPLOY_ENV === "production"
    ? {
        clientId: await secrets.get("epic-prod-client-id"),
        clientSecret: await secrets.get("epic-prod-client-secret"),
        iss: "https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4",
        redirectUri: "https://app.example.com/callback",
        scopes: ["openid", "fhirUser", "patient/Patient.rs"],
      }
    : {
        clientId: await secrets.get("epic-sandbox-client-id"),
        iss: "https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4", // same sandbox base for most vendors
        redirectUri: "http://localhost:3000/callback",
        scopes: ["openid", "fhirUser"],
      };
```

Adding an internal environment flag to this library would duplicate
what `iss`/`clientId`/`clientSecret` already express, and would work
against FR5's explicit "no assumptions baked in" intent — there's
nothing an environment flag would let the library do that supplying a
different config value doesn't already do.

## 8. Vendor-specific notes (from actual testing, not assumptions)

> This section covers the three vendors validated hands-on during
> development. For the full per-vendor breakdown (supported launch types,
> required scopes, known limitations) including four additional vendors
> sourced from public docs, see [vendor-notes.md](./vendor-notes.md).

**SMART Health IT** (`launch.smarthealthit.org`) is the easiest to
validate against and is spec-compliant by design. One quirk: its
"standalone" test mode still expects a `launch` context parameter
internally — hitting its `/authorize` endpoint directly with a
spec-correct, launch-param-free standalone request can fail with
`Invalid launch options: SyntaxError: Unexpected end of JSON input`.
Use their own picker UI (which drives the EHR-launch path, not
standalone) to test against this sandbox specifically.

**Epic**: scope syntax and client-type settings are unforgiving.
Confirm your app's registered **SMART Scope Version** (v1 vs v2) before
picking a scope string — v1's `patient/*.read` wildcard is rejected
outright by a v2-registered app. `redirect_uri` must be registered
*exactly*, including port — Epic's own "Invalid OAuth 2.0 request" error
page gives no detail on which check failed, so verify config
methodically rather than guessing from the error text alone. Also check
Epic's **Data Use Questionnaire** on the app registration — an
incomplete questionnaire can block sandbox activation even when every
OAuth2 parameter is correct.

**Cerner/Oracle Health**: keep **Redirect URI** (where the code comes
back) and **SMART® Launch URI** (where the EHR opens your app) as two
distinct, correctly-suffixed URLs — pointing both at the same path
breaks the callback step. If you see
`urn:cerner:error:authorization-server:smart-v1:grant:launch:mismatched-identity`,
try the test flow in an incognito/private window — an existing
developer-console session in the same browser can conflict with the
simulated patient identity the test launch expects.

**General pattern across all three**: none of the real failures we hit
during validation were library bugs — they were vendor console
configuration (redirect URI registration, scope version, client type)
or vendor-side session state. Discovery, PKCE, state validation, and
token exchange worked correctly against all three on the first attempt
each time the configuration matched what the library actually sends.

## 9. Troubleshooting

> See [common-errors.md](./common-errors.md) for the fuller writeup of
> each of these (causes, fixes, and which typed error class each one
> surfaces as).

| Symptom | Likely cause | Fix |
|---|---|---|
| Generic "Invalid OAuth 2.0 request" (Epic) with no other detail | `redirect_uri` not registered exactly, or scope-version mismatch, or an incomplete app questionnaire | Check redirect URI list first (most common), then scope version, then any pending registration questionnaire |
| `mismatched-identity` (Cerner) | Existing developer session in the same browser | Retry in incognito/private window |
| `Invalid launch options: SyntaxError...` (SMART Health IT) | Hit `/authorize` directly for "standalone" without going through their picker | Use their picker UI, or test standalone against a different vendor |
| Scope string in your outgoing request doesn't match what you configured | Vendor may grant its own pre-approved scope set regardless of what you request (observed with Epic) | Read the actual `scope` field back from the token response (`token.scope`) rather than assuming what you requested is what you got |
| `StateMismatchError` immediately on callback | Multiple tabs/retries reusing a stale `pending`, or the session store lost the entry | Ensure `PendingLaunch` persistence survives the redirect round-trip (see §3) |

## 10. Deployment checklist

- [ ] Production `TokenStorage` implemented and encrypted at rest
- [ ] `PendingLaunch` persisted in a real session store with a short TTL, not an in-process `Map`
- [ ] All `redirect_uri` values are HTTPS and registered exactly with every vendor you support
- [ ] `clientId`/`clientSecret` sourced from a secret manager, never committed, and scoped per environment (see §7)
- [ ] `ensureFreshToken` called per-request rather than a background refresh timer
- [ ] Error branches for every `SmartLaunchError` subclass in §4, not just a generic catch-all
- [ ] If any target vendor requires confidential/JWT-assertion client auth, confirmed this library's plain-secret-only token exchange is sufficient (see §6) before committing to that vendor
