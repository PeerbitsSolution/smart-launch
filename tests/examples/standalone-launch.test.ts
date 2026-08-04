import { describe, it, expect, vi, afterEach } from "vitest";
import request from "supertest";
import { app } from "../../docs/examples/standalone-launch/server";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("example app: standalone-launch", () => {
  it("GET / renders the standalone launch instructions page", async () => {
    const response = await request(app).get("/");
    expect(response.status).toBe(200);
    expect(response.text).toContain("standalone launch example");
  });

  it("GET /login redirects to the discovered authorization endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        jsonResponse({
          authorization_endpoint: "https://fhir.example.test/authorize",
          token_endpoint: "https://fhir.example.test/token",
        }),
      ),
    );

    const response = await request(app).get("/login");

    expect(response.status).toBe(302);
    expect(response.headers.location).toContain("https://fhir.example.test/authorize");
    expect(response.headers.location).not.toContain("launch=");
  });

  it("GET /callback with an unknown state returns 400", async () => {
    const response = await request(app).get("/callback").query({ code: "x", state: "never-issued" });
    expect(response.status).toBe(400);
  });
});
