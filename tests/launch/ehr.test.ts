import { describe, it, expect, vi, afterEach } from "vitest";
import { buildEhrAuthorizationRequest, handleEhrCallback } from "../../src/launch/ehr";
import { MissingLaunchParameterError, StateMismatchError, TokenExchangeError } from "../../src/errors";
import type { LaunchConfig } from "../../src/types";

const config: LaunchConfig = {
  clientId: "YOUR_CLIENT_ID_HERE",
  scopes: ["openid", "fhirUser"],
  redirectUri: "https://app.example.test/callback",
};

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response;
}

function stubDiscovery() {
  return vi.fn().mockResolvedValueOnce(
    jsonResponse({
      authorization_endpoint: "https://fhir.example.test/authorize",
      token_endpoint: "https://fhir.example.test/token",
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildEhrAuthorizationRequest", () => {
  it("fails fast on a missing iss, before any network call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(buildEhrAuthorizationRequest({ launch: "launch-id" }, config)).rejects.toBeInstanceOf(
      MissingLaunchParameterError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails fast on a missing launch parameter", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      buildEhrAuthorizationRequest({ iss: "https://fhir.example.test" }, config),
    ).rejects.toBeInstanceOf(MissingLaunchParameterError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("builds an authorization URL with launch, aud, PKCE challenge, and the launch scope", async () => {
    vi.stubGlobal("fetch", stubDiscovery());

    const { authorizationUrl, pending } = await buildEhrAuthorizationRequest(
      { iss: "https://fhir.example.test", launch: "launch-id-123" },
      config,
    );

    const url = new URL(authorizationUrl);
    expect(url.origin + url.pathname).toBe("https://fhir.example.test/authorize");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("launch")).toBe("launch-id-123");
    expect(url.searchParams.get("aud")).toBe("https://fhir.example.test");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")?.split(" ")).toEqual(expect.arrayContaining(["openid", "fhirUser", "launch"]));
    expect(pending.state).toBeTruthy();
    expect(pending.tokenEndpoint).toBe("https://fhir.example.test/token");
  });
});

describe("handleEhrCallback", () => {
  const pending = {
    state: "expected-state",
    codeVerifier: "verifier",
    iss: "https://fhir.example.test",
    tokenEndpoint: "https://fhir.example.test/token",
    redirectUri: config.redirectUri,
    launch: "launch-id-123",
  };

  it("rejects immediately on a state mismatch, never reaching token exchange", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      handleEhrCallback({ code: "auth-code", state: "wrong-state" }, pending, config),
    ).rejects.toBeInstanceOf(StateMismatchError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces an authorization-server error (e.g. access_denied) without attempting token exchange", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      handleEhrCallback({ error: "access_denied", error_description: "user declined" }, pending, config),
    ).rejects.toBeInstanceOf(TokenExchangeError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails fast when code is missing despite a matching state", async () => {
    await expect(handleEhrCallback({ state: "expected-state" }, pending, config)).rejects.toBeInstanceOf(
      MissingLaunchParameterError,
    );
  });

  it("exchanges the code for a token when state matches", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        access_token: "YOUR_ACCESS_TOKEN_HERE",
        token_type: "Bearer",
        expires_in: 3600,
        patient: "patient-123",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const token = await handleEhrCallback({ code: "auth-code", state: "expected-state" }, pending, config);

    expect(token.accessToken).toBe("YOUR_ACCESS_TOKEN_HERE");
    expect(token.context.patient).toBe("patient-123");
  });
});
