import { describe, it, expect, vi, afterEach } from "vitest";
import request from "supertest";
import { app } from "../../docs/examples/express-ehr-launch/server";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("example app: express-ehr-launch", () => {
  it("GET / renders the launch instructions page", async () => {
    const response = await request(app).get("/");
    expect(response.status).toBe(200);
    expect(response.text).toContain("EHR launch example");
  });

  it("GET /launch without iss/launch returns 400 and does not redirect", async () => {
    const response = await request(app).get("/launch");
    expect(response.status).toBe(400);
  });

  it("GET /launch with valid iss/launch redirects to the discovered authorization endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        jsonResponse({
          authorization_endpoint: "https://fhir.example.test/authorize",
          token_endpoint: "https://fhir.example.test/token",
        }),
      ),
    );

    const response = await request(app).get("/launch").query({ iss: "https://fhir.example.test", launch: "launch-1" });

    expect(response.status).toBe(302);
    expect(response.headers.location).toContain("https://fhir.example.test/authorize");
    expect(response.headers.location).toContain("launch=launch-1");
  });

  it("GET /callback with an unknown state returns 400", async () => {
    const response = await request(app).get("/callback").query({ code: "x", state: "never-issued" });
    expect(response.status).toBe(400);
  });
});
