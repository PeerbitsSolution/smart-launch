/**
 * Example: standalone launch flow, wired up with Express.
 *
 * Demo only — see SECURITY.md. Pending-launch state and tokens are kept
 * in process memory; a real app needs a session store and a durable
 * TokenStorage backend.
 */
import express from "express";
import {
  buildStandaloneAuthorizationRequest,
  handleStandaloneCallback,
  InMemoryTokenStorage,
  StateMismatchError,
  TokenExchangeError,
} from "../../../src/index";
import type { LaunchConfig, PendingLaunch } from "../../../src/types";

const PORT = Number(process.env.PORT ?? 3001);

// Obviously-placeholder example config — see SECURITY.md.
//
// Scope syntax is SMART-version-dependent and vendor-enforced — confirm
// against the current SMART App Launch spec and your app's registered
// SMART Scope Version before assuming either of these:
//   - SMART v1: "patient/*.read" (wildcard resource, read-only)
//   - SMART v2: fine-grained "<resourceType>.<c|r|u|d|s combination>",
//     e.g. "patient/Patient.rs patient/Observation.rs" (no v1-style
//     wildcard-with-.read form)
// A v2-registered app will reject a v1-style scope outright; this is the
// authorization server correctly enforcing the spec version it was
// registered under, not a library bug. Override via SMART_SCOPES
// (space-separated) to match your own app's registration.
const config: LaunchConfig = {
  clientId: process.env.SMART_CLIENT_ID ?? "YOUR_CLIENT_ID_HERE",
  scopes: process.env.SMART_SCOPES ? process.env.SMART_SCOPES.split(" ") : ["openid", "fhirUser", "patient/*.read"],
  redirectUri: process.env.SMART_REDIRECT_URI ?? `http://localhost:${PORT}/callback`,
  iss: process.env.SMART_FHIR_ISS ?? "https://launch.smarthealthit.org/v/r4/fhir",
};

const pendingLaunches = new Map<string, PendingLaunch>();
const tokenStorage = new InMemoryTokenStorage();

const app = express();

app.get("/login", async (_req, res) => {
  try {
    const { authorizationUrl, pending } = await buildStandaloneAuthorizationRequest(config);
    pendingLaunches.set(pending.state, pending);
    res.redirect(authorizationUrl);
  } catch (err) {
    res.status(500).send(`Standalone launch failed: ${(err as Error).message}`);
  }
});

app.get("/callback", async (req, res) => {
  const state = typeof req.query.state === "string" ? req.query.state : undefined;
  const pending = state ? pendingLaunches.get(state) : undefined;

  if (!pending) {
    res.status(400).send("Unknown or expired launch state — start again at /login");
    return;
  }
  pendingLaunches.delete(state as string);

  try {
    const token = await handleStandaloneCallback(
      {
        code: typeof req.query.code === "string" ? req.query.code : undefined,
        state,
        error: typeof req.query.error === "string" ? req.query.error : undefined,
        error_description:
          typeof req.query.error_description === "string" ? req.query.error_description : undefined,
      },
      pending,
      config,
    );

    await tokenStorage.set(state as string, token);

    res.type("html").send(`
      <h1>Standalone launch succeeded</h1>
      <p>Patient in context: <code>${token.context.patient ?? "(none returned)"}</code></p>
      <p>Encounter in context: <code>${token.context.encounter ?? "(none returned)"}</code></p>
      <p>fhirUser: <code>${token.context.fhirUser ?? "(none returned)"}</code></p>
      <p>Scopes granted: <code>${token.scope ?? "(not reported)"}</code></p>
    `);
  } catch (err) {
    if (err instanceof StateMismatchError) {
      res.status(400).send("state mismatch on callback — request rejected");
      return;
    }
    if (err instanceof TokenExchangeError) {
      res.status(400).send(`Authorization server error: ${err.error}${err.errorDescription ? ` — ${err.errorDescription}` : ""}`);
      return;
    }
    res.status(500).send(`Callback failed: ${(err as Error).message}`);
  }
});

app.get("/", (_req, res) => {
  res.type("html").send(`
    <h1>smart-launch — standalone launch example</h1>
    <p>Unlike the EHR launch example, this app already knows which FHIR
    server to talk to (<code>${config.iss}</code>) and initiates the
    launch itself.</p>
    <p><a href="/login">Start standalone launch</a></p>
  `);
});

export { app, pendingLaunches, tokenStorage };

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  app.listen(PORT, () => {
    console.log(`Standalone launch example listening on http://localhost:${PORT}`);
  });
}
