import { describe, it, expect, vi, afterEach } from "vitest";
import { exchangeCodeForToken, refreshAccessToken, ensureFreshToken } from "../src/token";
import { TokenExchangeError, RefreshFailedError } from "../src/errors";
import { InMemoryTokenStorage } from "../src/storage";
import type { LaunchConfig } from "../src/types";

const config: LaunchConfig = {
  clientId: "YOUR_CLIENT_ID_HERE",
  scopes: ["openid", "fhirUser", "patient/*.read"],
  redirectUri: "https://app.example.test/callback",
};

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("exchangeCodeForToken", () => {
  it("exchanges a code + verifier for a token on the success path", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        access_token: "YOUR_ACCESS_TOKEN_HERE",
        token_type: "Bearer",
        expires_in: 3600,
        refresh_token: "YOUR_REFRESH_TOKEN_HERE",
        patient: "example-patient-id",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const token = await exchangeCodeForToken(config, "https://fhir.example.test/token", "auth-code", "verifier");

    expect(token.accessToken).toBe("YOUR_ACCESS_TOKEN_HERE");
    expect(token.refreshToken).toBe("YOUR_REFRESH_TOKEN_HERE");
    expect(token.context.patient).toBe("example-patient-id");
    expect(token.expiresAt).toBeGreaterThan(Date.now());

    const [, requestInit] = fetchMock.mock.calls[0]!;
    const body = requestInit.body as URLSearchParams;
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("auth-code");
    expect(body.get("code_verifier")).toBe("verifier");
  });

  it("throws a typed TokenExchangeError carrying the OAuth2 error code on invalid_grant", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({ error: "invalid_grant", error_description: "authorization code expired" }, false, 400),
    );
    vi.stubGlobal("fetch", fetchMock);

    const promise = exchangeCodeForToken(config, "https://fhir.example.test/token", "expired-code", "verifier");
    await expect(promise).rejects.toBeInstanceOf(TokenExchangeError);
    await expect(promise).rejects.toMatchObject({ error: "invalid_grant" });
  });

  it("does not retry silently on a token endpoint error", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ error: "invalid_grant" }, false, 400));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      exchangeCodeForToken(config, "https://fhir.example.test/token", "code", "verifier"),
    ).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("ensureFreshToken", () => {
  it("returns the stored token unchanged when it is still fresh", async () => {
    const storage = new InMemoryTokenStorage();
    await storage.set("session-1", {
      accessToken: "still-fresh",
      tokenType: "Bearer",
      expiresAt: Date.now() + 10 * 60 * 1000,
      context: {},
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const token = await ensureFreshToken(config, "https://fhir.example.test/token", storage, "session-1");

    expect(token.accessToken).toBe("still-fresh");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshes and persists a new token when the stored one is near expiry, and invokes onRefresh", async () => {
    const storage = new InMemoryTokenStorage();
    await storage.set("session-1", {
      accessToken: "stale",
      tokenType: "Bearer",
      refreshToken: "refresh-me",
      expiresAt: Date.now() + 1000, // within the default 60s skew
      context: {},
    });
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({ access_token: "fresh-token", token_type: "Bearer", expires_in: 3600 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const onRefresh = vi.fn();
    const token = await ensureFreshToken(config, "https://fhir.example.test/token", storage, "session-1", {
      onRefresh,
    });

    expect(token.accessToken).toBe("fresh-token");
    expect(onRefresh).toHaveBeenCalledWith(expect.objectContaining({ accessToken: "fresh-token" }));
    expect((await storage.get("session-1"))?.accessToken).toBe("fresh-token");
  });

  it("throws RefreshFailedError when no token is stored for the key", async () => {
    const storage = new InMemoryTokenStorage();
    await expect(
      ensureFreshToken(config, "https://fhir.example.test/token", storage, "missing-session"),
    ).rejects.toBeInstanceOf(RefreshFailedError);
  });

  it("throws RefreshFailedError when the token is expired and no refresh_token is available", async () => {
    const storage = new InMemoryTokenStorage();
    await storage.set("session-1", {
      accessToken: "expired",
      tokenType: "Bearer",
      expiresAt: Date.now() - 1000,
      context: {},
    });
    await expect(
      ensureFreshToken(config, "https://fhir.example.test/token", storage, "session-1"),
    ).rejects.toBeInstanceOf(RefreshFailedError);
  });

  it("throws RefreshFailedError when the refresh_token is rejected by the server (revoked/expired)", async () => {
    const storage = new InMemoryTokenStorage();
    await storage.set("session-1", {
      accessToken: "expired",
      tokenType: "Bearer",
      refreshToken: "revoked-refresh-token",
      expiresAt: Date.now() - 1000,
      context: {},
    });
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ error: "invalid_grant" }, false, 400));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      ensureFreshToken(config, "https://fhir.example.test/token", storage, "session-1"),
    ).rejects.toBeInstanceOf(RefreshFailedError);
  });
});

describe("refreshAccessToken", () => {
  it("carries the previous refresh_token forward when the server doesn't re-issue one", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({ access_token: "new-access-token", token_type: "Bearer", expires_in: 3600 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const token = await refreshAccessToken(config, "https://fhir.example.test/token", "original-refresh-token");
    expect(token.refreshToken).toBe("original-refresh-token");
  });
});
