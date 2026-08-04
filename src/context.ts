/**
 * Typed parsing of SMART launch-context claims out of a token endpoint
 * response. Every claim is optional per spec — a standalone launch, or
 * an EHR that doesn't grant a particular context, must parse cleanly
 * rather than throw. Confirm claim names against the current SMART App
 * Launch spec before adding new ones.
 */
import type { LaunchContext, TokenResponse } from "./types.js";

export function parseLaunchContext(response: TokenResponse | Record<string, unknown>): LaunchContext {
  const context: LaunchContext = {};
  if (typeof response.patient === "string") context.patient = response.patient;
  if (typeof response.encounter === "string") context.encounter = response.encounter;
  if (typeof response.fhirUser === "string") context.fhirUser = response.fhirUser;
  if (typeof response.need_patient_banner === "boolean") context.needPatientBanner = response.need_patient_banner;
  if (typeof response.smart_style_url === "string") context.smartStyleUrl = response.smart_style_url;
  return context;
}
