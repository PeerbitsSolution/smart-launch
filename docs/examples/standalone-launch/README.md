# Example: standalone launch (Express)

Demonstrates the standalone launch flow (handover FR2) against the
public [SMART Health IT sandbox](https://launch.smarthealthit.org/).

**Demo only** — not production-hardened. See [SECURITY.md](../../../SECURITY.md).

## Run it

```bash
npm install
npm run example:standalone
```

Open `http://localhost:3001` and click **Start standalone launch**.
Unlike the EHR example, nothing launches this app from an EHR session —
it already knows which FHIR server to talk to and initiates the
authorization redirect itself.

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `PORT` | `3001` | Port the example app listens on |
| `SMART_CLIENT_ID` | `YOUR_CLIENT_ID_HERE` | Client ID registered with the sandbox |
| `SMART_REDIRECT_URI` | `http://localhost:3001/callback` | Must match what's registered with the sandbox |
| `SMART_FHIR_ISS` | `https://launch.smarthealthit.org/v/r4/fhir` | FHIR server base URL |
| `SMART_SCOPES` | `openid fhirUser patient/*.read` (v1 syntax) | Space-separated scope list |

**`SMART_SCOPES` is version-sensitive.** The default uses SMART v1
wildcard syntax (`patient/*.read`). Vendors that register your app under
**SMART v2** (fine-grained scopes) will reject that form outright — that's
the authorization server correctly enforcing the version it was
registered under, not a bug here. For a v2 app, override with something
like `SMART_SCOPES="openid fhirUser patient/Patient.rs patient/Observation.rs"`
(confirm exact syntax against the current SMART App Launch spec and your
vendor's docs — v1 vs v2 scope shape is not something to assume from
memory).

Never commit a real client_id/secret — use a local `.env` (gitignored)
instead.
