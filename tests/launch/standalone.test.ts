import { describe, it, expect, vi, afterEach } from "vitest";
import { buildStandaloneAuthorizationRequest, handleStandaloneCallback } from "../../src/launch/standalone";
import { MissingLaunchParameterError, StateMismatchError } from "../../src/errors";
import type { LaunchConfig } from "../../src/types";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildStandaloneAuthorizationRequest", () => {
  it("fails fast when config.iss is not set, before any network call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const config: LaunchConfig = {
      clientId: "YOUR_CLIENT_ID_HERE",
      scopes: ["openid", "fhirUser", "patient/*.read"],
      redirectUri: "https://app.example.test/callback",
    };

    await expect(buildStandaloneAuthorizationRequest(config)).rejects.toBeInstanceOf(MissingLaunchParameterError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("builds an authorization URL without a launch parameter, using the patient-facing scope pattern", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        authorization_endpoint: "https://fhir.example.test/authorize",
        token_endpoint: "https://fhir.example.test/token",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const config: LaunchConfig = {
      clientId: "YOUR_CLIENT_ID_HERE",
      scopes: ["openid", "fhirUser", "patient/*.read"],
      redirectUri: "https://app.example.test/callback",
      iss: "https://fhir.example.test",
    };

    const { authorizationUrl, pending } = await buildStandaloneAuthorizationRequest(config);
    const url = new URL(authorizationUrl);

    expect(url.searchParams.has("launch")).toBe(false);
    expect(url.searchParams.get("aud")).toBe("https://fhir.example.test");
    expect(url.searchParams.get("scope")).toBe("openid fhirUser patient/*.read");
    expect(pending.launch).toBeUndefined();
  });
});

describe("handleStandaloneCallback", () => {
  it("rejects immediately on a state mismatch", async () => {
    const config: LaunchConfig = {
      clientId: "YOUR_CLIENT_ID_HERE",
      scopes: ["openid"],
      redirectUri: "https://app.example.test/callback",
      iss: "https://fhir.example.test",
    };
    const pending = {
      state: "expected-state",
      codeVerifier: "verifier",
      iss: "https://fhir.example.test",
      tokenEndpoint: "https://fhir.example.test/token",
      redirectUri: config.redirectUri,
    };

    await expect(
      handleStandaloneCallback({ code: "auth-code", state: "wrong-state" }, pending, config),
    ).rejects.toBeInstanceOf(StateMismatchError);
  });

  it("produces a token with no launch-context claims for a standalone launch", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({ access_token: "YOUR_ACCESS_TOKEN_HERE", token_type: "Bearer", expires_in: 3600 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const config: LaunchConfig = {
      clientId: "YOUR_CLIENT_ID_HERE",
      scopes: ["openid"],
      redirectUri: "https://app.example.test/callback",
      iss: "https://fhir.example.test",
    };
    const pending = {
      state: "expected-state",
      codeVerifier: "verifier",
      iss: "https://fhir.example.test",
      tokenEndpoint: "https://fhir.example.test/token",
      redirectUri: config.redirectUri,
    };

    const token = await handleStandaloneCallback({ code: "auth-code", state: "expected-state" }, pending, config);
    expect(token.context).toEqual({});
  });
});
