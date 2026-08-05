# Vendor Notes

Per-vendor notes for implementing SMART on FHIR against real EHR/FHIR
platforms with `smart-launch`.

**Confidence levels differ by vendor, and that's marked explicitly below:**

- **Hands-on tested** (SMART Health IT, Epic, Oracle Health/Cerner) — every
  claim here came from live, human-verified launches during this library's
  development: real login, real token exchange, real errors reproduced and
  diagnosed. See [PRODUCTION_GUIDE.md §8](./PRODUCTION_GUIDE.md#8-vendor-specific-notes-from-actual-testing-not-assumptions)
  for the full incident-level detail behind the summaries below.
- **From public docs, not independently tested** (athenahealth,
  eClinicalWorks, Canvas Medical, Medplum) — sourced from each vendor's
  public developer documentation and community reports, cited inline.
  Treat these as a starting point, not a guarantee — verify against the
  vendor's current docs and your own sandbox before relying on them.

---

## SMART Health IT — hands-on tested

The public reference sandbox, spec-compliant by design. Best first target
for validating any new SMART flow before touching a real vendor.

- **Supported launch types:** EHR launch and standalone launch
- **Required scopes:** lenient — `openid fhirUser patient/*.read` (v1-style
  wildcard) works out of the box
- **Known limitations:** the sandbox's "standalone" test mode still expects
  an internal launch-context parameter. Hitting `/authorize` directly with
  a spec-correct, launch-param-free standalone request fails with
  `Invalid launch options: SyntaxError: Unexpected end of JSON input`.
- **Common implementation issues:** none beyond the standalone quirk above
  — this is the sandbox every other vendor's behavior should be compared
  against when something looks wrong elsewhere.
- **Docs:** [launch.smarthealthit.org](https://launch.smarthealthit.org/),
  [docs.smarthealthit.org](https://docs.smarthealthit.org/)

## Epic — hands-on tested

- **Supported launch types:** EHR launch and standalone launch
- **Required scopes:** **version-sensitive.** Confirm the app's registered
  **SMART Scope Version** (v1 vs v2) before picking a scope string — a
  v2-registered app rejects the v1 wildcard `patient/*.read` outright and
  requires fine-grained scopes instead (e.g. `patient/Patient.rs`).
- **Known limitations:** confidential clients (JWK Set + client secret)
  use JWT-assertion authentication, which this library does not implement
  — see [PRODUCTION_GUIDE.md §6](./PRODUCTION_GUIDE.md#6-security-checklist-before-going-live).
  Only public clients with PKCE are supported end-to-end.
- **Common implementation issues:**
  - `redirect_uri` must match a registered Endpoint URI *exactly*,
    including port — Epic's generic "Invalid OAuth 2.0 request" error
    gives no detail on which check failed.
  - An incomplete **Data Use Questionnaire** on the app registration can
    block sandbox activation even when every OAuth2 parameter is correct.
  - MyChart login handoff errors (`error=4`, "the request is invalid")
    have been traced by other developers to sandbox config propagation
    delay (up to a day or two) or account-side 2FA state — not always a
    request-shape problem.
  - Epic publishes a generic public test-patient login for sandbox testing
    (username `fhirjason`).
- **Docs:** [fhir.epic.com](https://fhir.epic.com/),
  [open.epic.com](https://open.epic.com/)

## Oracle Health / Cerner — hands-on tested

- **Supported launch types:** EHR launch and standalone launch
- **Required scopes:** `openid fhirUser launch/patient` (or `launch` for
  EHR launch). Unlike Epic, Cerner grants exactly the scopes requested
  rather than a broader pre-approved set.
- **Known limitations:** none found beyond the issues below.
- **Common implementation issues:**
  - Cerner's console has two distinct URI fields — **Redirect URI**
    (where the authorization code comes back) and **SMART® Launch URI**
    (where the EHR opens the app with `iss`/`launch`). Pointing both at
    the same path breaks the callback step.
  - `urn:cerner:error:authorization-server:smart-v1:grant:launch:mismatched-identity`
    was resolved by retrying in an incognito/private window — an existing
    developer-console session in the same browser conflicted with the
    simulated patient identity the test launch expected.
- **Docs:** [code.cerner.com](https://code.cerner.com/),
  [fhir.cerner.com](https://fhir.cerner.com/)

## athenahealth — from public docs, not independently tested

- **Supported launch types:** athenahealth documents SMART on FHIR launch
  (embedded app) alongside separate 2-legged (`client_credentials`) and
  3-legged (`authorization_code`) OAuth2 grants on the same infrastructure
  — register separately per integration type.
- **Required scopes:** not enumerated publicly in a fixed list; athena's
  own guidance is to request the minimum scopes needed.
- **Known limitations:** the sandbox is described as a "walled garden"
  with canned test data and is region-locked (requires a North American
  IP to reach).
- **Common implementation issues:** production access for many athenaOne
  APIs requires a separate Platform Services contract and a BAA — budget
  for that before assuming sandbox-to-production is a config change only.
- **Docs:** [Athena EMR/EHR Integration guide](https://topflightapps.com/ideas/athena-ehr-emr-integration/),
  [athenahealth SMART on FHIR policy-config thread](https://groups.google.com/g/smart-on-fhir/c/wJBjRMZdLnc)

## eClinicalWorks — from public docs, not independently tested

- **Supported launch types:** EHR launch is documented; a public developer
  community thread specifically reports difficulty getting an EHR-launch
  app working in eCW's sandbox, so budget extra time for this vendor.
- **Required scopes:** the scope list sent in the authorization request
  can be a subset of what was registered for the app in the eClinicalWorks
  Developer Portal — registering broad and requesting narrow is the
  documented pattern.
- **Known limitations:** `aud` must equal `iss` — same convention as most
  other SMART vendors, but worth confirming explicitly since eCW's docs
  call it out.
- **Common implementation issues:** community reports of EHR-launch
  sandbox friction (see thread below); no independent confirmation from
  this project of a specific root cause.
- **Docs:** [SMART App Launch spec — Scopes and Launch Context](https://build.fhir.org/ig/HL7/smart-app-launch/scopes-and-launch-context.html),
  [eClinicalWorks EHR-launch community thread](https://groups.google.com/g/smart-on-fhir/c/m0iTV-T23z8)

## Canvas Medical — from public docs, not independently tested

- **Supported launch types:** Canvas documents embedding SMART on FHIR
  apps into the Canvas EMR via its own launch-sequence guide.
- **Required scopes:** configured directly in the app's launch code
  (`launch.html` in Canvas's example) rather than solely via a developer
  portal UI; apps can be scoped "global" or "patient specific."
- **Known limitations:** Canvas has added SMART v2 granular scope support
  — same v1-vs-v2 syntax caution as Epic likely applies here too, though
  this project has not independently confirmed Canvas's exact behavior on
  a mismatch.
- **Common implementation issues:** none independently confirmed; consult
  Canvas's own guide before assuming behavior matches another vendor.
- **Docs:** [Embedding a SMART app into Canvas](https://docs.canvasmedical.com/guides/embedding-a-smart-on-fhir-application/)

## Medplum — from public docs, not independently tested

- **Supported launch types:** Medplum implements the SMART App Launch 2.0.0
  standard both as an identity provider (hosting your app's launch) and as
  a client (launching against another FHIR server).
- **Required scopes:** documented in Medplum's own SMART Scopes reference;
  standard SMART scope syntax.
- **Known limitations:** if using Medplum as the identity provider, the
  `ClientApplication.launchIdentifierSystems` config changes what value
  comes back as the `patient`/`encounter` context claim (an external
  identifier system's value instead of the raw FHIR resource id) — worth
  checking explicitly since this library's `context.ts` expects those
  claims to be the values the server actually returns, whatever they are.
- **Common implementation issues:** none independently confirmed.
- **Docs:** [SMART App Launch — Medplum](https://www.medplum.com/docs/integration/smart-app-launch),
  [SMART Scopes — Medplum](https://www.medplum.com/docs/access/smart-scopes)
