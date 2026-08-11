# Example: EHR launch (Express)

Demonstrates the EHR launch flow (handover FR1) against the public
[SMART Health IT sandbox](https://launch.smarthealthit.org/).

**Demo only** — not production-hardened. Pending-launch state and
issued tokens are kept in process memory. See [SECURITY.md](../../../SECURITY.md).

> This example lives inside the library's own repo, so it imports the
> library from local source (`../../../src/index.js`) to exercise the
> code you're about to run, not the published package. In your own
> project, install and import it normally:
> `npm install @peerbits/smart-launch`, then
> `import { buildEhrAuthorizationRequest, handleEhrCallback } from "@peerbits/smart-launch"`.

## Run it

```bash
npm install
npm run example:ehr
```

This starts the app on `http://localhost:3000`.

## Try it against the sandbox

1. Open [launch.smarthealthit.org](https://launch.smarthealthit.org/).
2. Set **App Launch URL** to `http://localhost:3000/launch`.
3. Pick a patient and click **Launch**.
4. The sandbox redirects to `/launch?iss=...&launch=...`, which redirects
   to the sandbox's authorization endpoint, which redirects back to
   `/callback` after you approve the launch.
5. You should see the patient ID from the launch context printed on the
   callback page.

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Port the example app listens on |
| `SMART_CLIENT_ID` | `YOUR_CLIENT_ID_HERE` | Client ID registered with the sandbox |
| `SMART_REDIRECT_URI` | `http://localhost:3000/callback` | Must match what's registered with the sandbox |
| `SMART_SCOPES` | `openid fhirUser launch patient/*.read` (v1 syntax) | Space-separated scope list |

The default `SMART_CLIENT_ID` is an obvious placeholder. The SMART
Health IT sandbox accepts any `client_id` for its public test apps —
for a real EHR vendor sandbox (Epic, Cerner), register a free developer
app and set `SMART_CLIENT_ID` to the value it issues you. Never commit
a real client_id/secret — use a local `.env` (gitignored) instead.

**`SMART_SCOPES` is version-sensitive.** The default is SMART v1 wildcard
syntax. A vendor app registered under **SMART v2** will reject it — that's
the authorization server correctly enforcing its registered spec version,
not a bug here. Set `SMART_SCOPES` to your app's actual v2-style scopes
(e.g. `"openid fhirUser launch patient/Patient.rs patient/Observation.rs"`),
confirming the exact syntax against the current SMART App Launch spec
rather than assuming it.
