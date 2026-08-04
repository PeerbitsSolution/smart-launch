# smart-launch

> SMART on FHIR authentication & launch flow reference implementation

**Category:** FHIR & SMART — Interoperability Libraries · **License:** Apache-2.0 · **Status:** alpha

---

## 1. What problem does this solve?

Every SMART on FHIR integration re-implements the same brittle first step:
the OAuth2 Authorization Code Grant with PKCE, EHR-launch vs.
standalone-launch handling, token exchange, and refresh. Vendor sandboxes
(Epic, Cerner/Oracle Health, SMART Health IT) each have small quirks in
this flow, and getting it wrong is the single most common cause of failed
FHIR integrations. `smart-launch` implements this once, correctly,
against the SMART App Launch specification — framework-agnostic, fully
typed, and with a pluggable token storage interface so you bring your own
production backend instead of inheriting an opinionated one.

## 2. Features

- EHR launch flow: `iss`/`launch` parameter handling, endpoint discovery,
  authorization redirect, and callback validation
- Standalone launch flow: same discovery/PKCE/token path for apps that
  already know their FHIR server
- Authorization Code Grant with PKCE (S256 only — no `plain` method)
- Discovery via `.well-known/smart-configuration`, with a CapabilityStatement
  (`oauth-uris` extension) fallback
- Token exchange, automatic refresh-before-expiry, and typed OAuth2 error
  surfacing (`invalid_grant`, state mismatch, PKCE failure, etc.)
- Typed parsing of launch-context claims (`patient`, `encounter`, `fhirUser`,
  `need_patient_banner`, `smart_style_url`) that tolerates any of them
  being absent
- Pluggable `TokenStorage` interface with an in-memory reference
  implementation (not for production use)
- Zero hardcoded client IDs, secrets, or scopes — everything is
  config-driven

## 3. Installation

```bash
npm install smart-launch
```

## 4. Quick Start

This example runs the standalone launch flow against the public
[SMART Health IT sandbox](https://launch.smarthealthit.org/) — no
registration required.

```ts
import {
  buildStandaloneAuthorizationRequest,
  handleStandaloneCallback,
  type LaunchConfig,
} from "smart-launch";

const config: LaunchConfig = {
  clientId: "YOUR_CLIENT_ID_HERE", // the sandbox accepts any client_id for its public test apps
  scopes: ["openid", "fhirUser", "patient/*.read"],
  redirectUri: "http://localhost:3001/callback",
  iss: "https://launch.smarthealthit.org/v/r4/fhir",
};

// 1. Build the redirect (send the browser to `authorizationUrl`,
//    and persist `pending` — session, signed cookie, etc.).
const { authorizationUrl, pending } = await buildStandaloneAuthorizationRequest(config);

// 2. On the callback route, validate `state` and exchange the code:
// const token = await handleStandaloneCallback(req.query, pending, config);
// token.accessToken, token.context.fhirUser, ...
```

See it running end-to-end with a real Express server in
[docs/examples/standalone-launch](./docs/examples/standalone-launch) and
[docs/examples/express-ehr-launch](./docs/examples/express-ehr-launch):

```bash
git clone https://github.com/PeerbitsSolution/smart-launch.git
cd smart-launch
npm install
npm run example:standalone
# open http://localhost:3001
```

## 5. Architecture

**Core library is framework-agnostic** (plain TypeScript, no Express/React
dependency) so it embeds in any Node backend or edge runtime. The example
apps under `docs/examples` add a thin Express adapter on top.

### Module layout

| Module | Responsibility |
|---|---|
| `discovery` | Resolves authorization/token endpoints from `.well-known/smart-configuration`, with a CapabilityStatement fallback |
| `pkce` | `code_verifier`/`code_challenge` generation (S256) and `state`/`nonce` generation |
| `launch/ehr` | EHR launch parameter handling and redirect construction |
| `launch/standalone` | Standalone launch redirect construction |
| `token` | Code-for-token exchange, refresh, expiry tracking |
| `context` | Typed parsing of launch-context claims from the token response |
| `storage` | `TokenStorage` interface + an in-memory reference implementation only |

### EHR launch sequence

1. EHR opens the app with `?iss={fhirBaseUrl}&launch={launchId}`
2. App fetches `{iss}/.well-known/smart-configuration` to discover the
   authorize/token endpoints (`discover`)
3. App generates a PKCE verifier/challenge and a random `state`, persists
   them for the callback, and redirects the browser to the authorize
   endpoint with `launch`, `aud`, `code_challenge`, and scopes
   (`buildEhrAuthorizationRequest`)
4. The EHR authenticates the user (outside this library's scope) and
   redirects back to `redirect_uri` with an authorization code and `state`
5. App validates `state`, then exchanges the code + `code_verifier` for a
   token (`handleEhrCallback`)
6. The token endpoint returns `access_token`, `refresh_token` (if
   `offline_access` was granted), `id_token`, and launch context claims
   (e.g. `patient`)
7. App stores the token via the configured `TokenStorage` implementation

Standalone launch follows the same steps minus step 1's `launch`
parameter and any launch-context claims in step 6. This is a summary for
orientation — refer to the current
[SMART App Launch Implementation Guide](https://hl7.org/fhir/smart-app-launch/)
for the canonical, authoritative sequence.

## 6. Example Usage

Both launch types are demonstrated as complete, runnable Express apps —
see [docs/examples](./docs/examples):

- [`docs/examples/express-ehr-launch`](./docs/examples/express-ehr-launch) —
  EHR launch, meant to be opened *from* an EHR (or the SMART Health IT
  sandbox launcher)
- [`docs/examples/standalone-launch`](./docs/examples/standalone-launch) —
  standalone launch, initiated by the app itself against a known FHIR server

Each example's README has copy-paste run instructions. Both are
configured entirely via environment variables — nothing is hardcoded
beyond obvious placeholders:

| Env var | Used by | Default | Purpose |
|---|---|---|---|
| `PORT` | both | `3000` (EHR) / `3001` (standalone) | Port the example app listens on |
| `SMART_CLIENT_ID` | both | `YOUR_CLIENT_ID_HERE` | Client ID registered with the vendor or sandbox |
| `SMART_REDIRECT_URI` | both | `http://localhost:<port>/callback` | Must exactly match what's registered with the vendor — verified strictly by every vendor tested |
| `SMART_FHIR_ISS` | standalone only | `https://launch.smarthealthit.org/v/r4/fhir` | FHIR server base URL. The EHR example instead gets `iss` at runtime from the `?iss=` launch parameter, so it has no equivalent variable |
| `SMART_SCOPES` | both | v1-style wildcard (e.g. `openid fhirUser patient/*.read`) | Space-separated scope list — **version-sensitive**; a SMART v2-registered app rejects v1 wildcard syntax outright. See the [Production Guide](./docs/PRODUCTION_GUIDE.md#8-vendor-specific-notes-from-actual-testing-not-assumptions) for real Epic/Cerner/SMART Health IT notes on this |

Deploying this beyond a local demo — production `TokenStorage`, session
handling for `PendingLaunch`, error-handling patterns, and vendor-specific
notes on Epic/Cerner/SMART Health IT gathered from real sandbox
testing — is covered in the **[Production Guide](./docs/PRODUCTION_GUIDE.md)**.

## 7. Roadmap

- [ ] SMART Backend Services support (system-to-system, no user context) —
      explicitly out of scope for this repo; candidate for a future
      package in this initiative
- [ ] Additional `TokenStorage` reference adapters (Redis, encrypted
      cookie) as documented examples — core package stays backend-agnostic
- [ ] Expanded launch-context claim coverage as the SMART spec adds new
      standard claims

## 8. Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Issues tagged `good first issue`
are a good place to start.

## 9. License

Apache License 2.0 — see [LICENSE](./LICENSE).

## 10. About PeerbitsSolution

smart-launch is part of the [PeerbitsSolution HealthTech Open Source](https://github.com/PeerbitsSolution)
initiative — reusable engineering components extracted from our healthcare
technology work, published so other teams don't have to solve the same
problems from scratch. This repository contains generalized, reusable logic
only; it is not tied to any specific client engagement or commercial product.
