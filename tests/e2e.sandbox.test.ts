/**
 * Integration tests against public SMART on FHIR sandboxes — no client
 * credentials required for discovery. Per handover §9.2, these are
 * tagged separately from unit tests and may be skipped in CI when a
 * sandbox is temporarily unavailable; they must be run manually before
 * any tagged release.
 *
 * Skipped by default (no live network calls in normal `npm test`/CI
 * runs). Run explicitly with:
 *
 *   RUN_SANDBOX_TESTS=1 npm run test:sandbox
 *
 * The full launch flow (authorize -> user login -> callback) cannot be
 * automated against a real EHR without a headless browser and a test
 * user account, so this file exercises the one piece that can be
 * verified unattended: SMART discovery against a live public server.
 * Full end-to-end launch validation (handover §9.2, M4) is a manual,
 * human-run step before release, not a CI job.
 */
import { describe, it, expect } from "vitest";
import { discover } from "../src/discovery";

const RUN_SANDBOX_TESTS = process.env.RUN_SANDBOX_TESTS === "1";

// SMART Health IT public reference sandbox — spec-compliant by design
// (handover §9.2, "primary reference sandbox").
const SMART_HEALTH_IT_SANDBOX_FHIR_BASE = "https://launch.smarthealthit.org/v/r4/fhir";

describe.skipIf(!RUN_SANDBOX_TESTS)("sandbox: SMART Health IT discovery", () => {
  it("sandbox: discovers authorization/token endpoints from the live public sandbox", async () => {
    const config = await discover(SMART_HEALTH_IT_SANDBOX_FHIR_BASE);

    expect(config.authorizationEndpoint).toMatch(/^https:\/\//);
    expect(config.tokenEndpoint).toMatch(/^https:\/\//);
  });
});
