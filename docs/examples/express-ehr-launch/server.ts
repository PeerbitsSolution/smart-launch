/**
 * Example: EHR launch flow, wired up with Express.
 *
 * This is a reference/demo app only — see SECURITY.md. Pending-launch
 * state and tokens are kept in process memory (`Map`/`InMemoryTokenStorage`),
 * which is fine for a single-process demo but is NOT safe for a
 * multi-instance or production deployment. Consuming applications must
 * bring their own session store and a real `TokenStorage` backend.
 *
 * Run against the public SMART Health IT sandbox — see the Quick Start
 * in the repo README, or docs/examples/express-ehr-launch/README.md.
 */
import express from "express";
import {
  buildEhrAuthorizationRequest,
  handleEhrCallback,
  InMemoryTokenStorage,
  MissingLaunchParameterError,
  StateMismatchError,
  TokenExchangeError,
} from "../../../src/index";
import type { LaunchConfig, PendingLaunch } from "../../../src/types";

const PORT = Number(process.env.PORT ?? 3000);

// Obviously-placeholder example config. Replace with your own values
// (never a real vendor client_id/secret in source control) — see
// SECURITY.md and the AI-assisted development guardrails.
//
// Scope syntax is SMART-version-dependent and vendor-enforced — see the
// longer note in docs/examples/standalone-launch/server.ts. A v2-registered
// app will reject the v1-style "patient/*.read" wildcard outright; that's
// the authorization server correctly enforcing spec version, not a bug
// here. Override via SMART_SCOPES (space-separated) to match your app.
const config: LaunchConfig = {
  clientId: process.env.SMART_CLIENT_ID ?? "YOUR_CLIENT_ID_HERE",
  scopes: process.env.SMART_SCOPES
    ? process.env.SMART_SCOPES.split(" ")
    : ["openid", "fhirUser", "launch", "patient/*.read"],
  redirectUri: process.env.SMART_REDIRECT_URI ?? `http://localhost:${PORT}/callback`,
};

// Demo-only: pending launches keyed by `state`, and issued tokens keyed
// by a made-up "session id" (here, just the state again). A real app
// would use a signed session cookie and a durable TokenStorage backend.
const pendingLaunches = new Map<string, PendingLaunch>();
const tokenStorage = new InMemoryTokenStorage();

const app = express();

app.get("/launch", async (req, res) => {
  try {
    const iss = typeof req.query.iss === "string" ? req.query.iss : undefined;
    const launch = typeof req.query.launch === "string" ? req.query.launch : undefined;

    const { authorizationUrl, pending } = await buildEhrAuthorizationRequest({ iss, launch }, config);
    pendingLaunches.set(pending.state, pending);

    res.redirect(authorizationUrl);
  } catch (err) {
    if (err instanceof MissingLaunchParameterError) {
      res.status(400).send(`Bad launch request: ${err.message}`);
      return;
    }
    res.status(500).send(`Launch failed: ${(err as Error).message}`);
  }
});

app.get("/callback", async (req, res) => {
  const state = typeof req.query.state === "string" ? req.query.state : undefined;
  const pending = state ? pendingLaunches.get(state) : undefined;

  if (!pending) {
    res.status(400).send("Unknown or expired launch state — start again at /launch");
    return;
  }
  pendingLaunches.delete(state as string);

  try {
    const token = await handleEhrCallback(
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
      <h1>EHR launch succeeded</h1>
      <p>Patient in context: <code>${token.context.patient ?? "(none returned)"}</code></p>
      <p>Access token expires at: <code>${token.expiresAt ? new Date(token.expiresAt).toISOString() : "unknown"}</code></p>
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
    <h1>peerbits-smart-launch — EHR launch example</h1>
    <p>This app is meant to be launched <em>from</em> an EHR (or the SMART
    Health IT sandbox launcher), which calls <code>/launch?iss=...&amp;launch=...</code>.</p>
    <p>To try it: open
    <a href="https://launch.smarthealthit.org/">launch.smarthealthit.org</a>,
    set "App Launch URL" to <code>http://localhost:${PORT}/launch</code>,
    and click Launch.</p>
  `);
});

export { app, pendingLaunches, tokenStorage };

// Only auto-listen when this file is run directly (`npm run example:ehr`),
// not when imported by a test (e.g. supertest against `app`).
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  app.listen(PORT, () => {
    console.log(`EHR launch example listening on http://localhost:${PORT}`);
  });
}
