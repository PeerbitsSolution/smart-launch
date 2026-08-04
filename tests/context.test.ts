import { describe, it, expect } from "vitest";
import { parseLaunchContext } from "../src/context";

describe("parseLaunchContext", () => {
  it("parses all known launch-context claims when present", () => {
    const context = parseLaunchContext({
      access_token: "token",
      token_type: "Bearer",
      patient: "patient-123",
      encounter: "encounter-456",
      fhirUser: "Practitioner/789",
      need_patient_banner: true,
      smart_style_url: "https://fhir.example.test/style.json",
    });

    expect(context).toEqual({
      patient: "patient-123",
      encounter: "encounter-456",
      fhirUser: "Practitioner/789",
      needPatientBanner: true,
      smartStyleUrl: "https://fhir.example.test/style.json",
    });
  });

  it("does not throw and returns an empty object when no optional claims are present (standalone launch)", () => {
    const context = parseLaunchContext({ access_token: "token", token_type: "Bearer" });
    expect(context).toEqual({});
  });

  it("ignores claims with the wrong type rather than throwing", () => {
    const context = parseLaunchContext({
      access_token: "token",
      token_type: "Bearer",
      patient: 12345 as unknown as string,
      need_patient_banner: "yes" as unknown as boolean,
    });
    expect(context.patient).toBeUndefined();
    expect(context.needPatientBanner).toBeUndefined();
  });
});
