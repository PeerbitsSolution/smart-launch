import { describe, it, expect, vi, afterEach } from "vitest";
import { discover } from "../src/discovery";
import { DiscoveryError } from "../src/errors";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("discovery", () => {
  it("parses authorization_endpoint/token_endpoint from .well-known/smart-configuration", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        authorization_endpoint: "https://fhir.example.test/auth",
        token_endpoint: "https://fhir.example.test/token",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const config = await discover("https://fhir.example.test");

    expect(config.authorizationEndpoint).toBe("https://fhir.example.test/auth");
    expect(config.tokenEndpoint).toBe("https://fhir.example.test/token");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://fhir.example.test/.well-known/smart-configuration",
      expect.any(Object),
    );
  });

  it("strips a trailing slash from iss before building the discovery URL", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        authorization_endpoint: "https://fhir.example.test/auth",
        token_endpoint: "https://fhir.example.test/token",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await discover("https://fhir.example.test/");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://fhir.example.test/.well-known/smart-configuration",
      expect.any(Object),
    );
  });

  it("falls back to the CapabilityStatement oauth-uris extension when smart-configuration is missing", async () => {
    const fetchMock = vi
      .fn()
      // .well-known/smart-configuration -> 404
      .mockResolvedValueOnce(jsonResponse({}, false, 404))
      // /metadata -> CapabilityStatement with oauth-uris extension
      .mockResolvedValueOnce(
        jsonResponse({
          resourceType: "CapabilityStatement",
          rest: [
            {
              security: {
                extension: [
                  {
                    url: "http://fhir-registry.smarthealthit.org/StructureDefinition/oauth-uris",
                    extension: [
                      { url: "authorize", valueUri: "https://fhir.example.test/authorize" },
                      { url: "token", valueUri: "https://fhir.example.test/token-fallback" },
                    ],
                  },
                ],
              },
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const config = await discover("https://fhir.example.test");

    expect(config.authorizationEndpoint).toBe("https://fhir.example.test/authorize");
    expect(config.tokenEndpoint).toBe("https://fhir.example.test/token-fallback");
  });

  it("throws DiscoveryError with a clear message when both discovery paths fail", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, false, 404))
      .mockResolvedValueOnce(jsonResponse({}, false, 404));
    vi.stubGlobal("fetch", fetchMock);

    await expect(discover("https://fhir.example.test")).rejects.toBeInstanceOf(DiscoveryError);
  });

  it("throws DiscoveryError when smart-configuration is present but missing required fields, and metadata also lacks oauth-uris", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ issuer: "https://fhir.example.test" }))
      .mockResolvedValueOnce(jsonResponse({ resourceType: "CapabilityStatement", rest: [{}] }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(discover("https://fhir.example.test")).rejects.toBeInstanceOf(DiscoveryError);
  });
});
