import { describe, it, expect } from "vitest";
import * as smartLaunch from "../src/index";

describe("peerbits-smart-launch public API", () => {
  it("exports a version", () => {
    expect(smartLaunch.VERSION).toBeTruthy();
  });

  it("exports the full documented public surface", () => {
    const expectedExports = [
      "discover",
      "createPkcePair",
      "verifyPkcePair",
      "generateState",
      "generateNonce",
      "deriveCodeChallenge",
      "buildEhrAuthorizationRequest",
      "handleEhrCallback",
      "buildStandaloneAuthorizationRequest",
      "handleStandaloneCallback",
      "exchangeCodeForToken",
      "refreshAccessToken",
      "ensureFreshToken",
      "parseLaunchContext",
      "InMemoryTokenStorage",
      "SmartLaunchError",
      "DiscoveryError",
      "MissingLaunchParameterError",
      "StateMismatchError",
      "PkceValidationError",
      "TokenExchangeError",
      "RefreshFailedError",
    ];

    for (const exportName of expectedExports) {
      expect(smartLaunch).toHaveProperty(exportName);
    }
  });
});

// Sandbox/integration tests belong in files named *.sandbox.test.ts so they
// can be run separately (npm run test:sandbox) and skipped in CI when a
// public sandbox is temporarily unavailable.
