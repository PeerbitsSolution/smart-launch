/**
 * Discovery of a FHIR server's OAuth2 authorization/token endpoints.
 *
 * Primary source: `{iss}/.well-known/smart-configuration`
 * (SMART App Launch, "Discovery" section — confirm field names against
 * the current published spec before changing this).
 *
 * Fallback: the FHIR CapabilityStatement at `{iss}/metadata`, reading the
 * `http://fhir-registry.smarthealthit.org/StructureDefinition/oauth-uris`
 * extension under `rest[0].security` (the SMART v1 discovery mechanism,
 * still advertised by some servers alongside the newer well-known
 * endpoint).
 */
import { DiscoveryError } from "./errors.js";
import type { SmartConfiguration } from "./types.js";

const DEFAULT_TIMEOUT_MS = 10_000;
const OAUTH_URIS_EXTENSION = "http://fhir-registry.smarthealthit.org/StructureDefinition/oauth-uris";

interface FetchJsonOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
}

async function fetchJson(url: string, options: FetchJsonOptions = {}): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json", ...options.headers },
    });
    if (!response.ok) {
      throw new Error(`${url} responded with HTTP ${response.status}`);
    }
    return (await response.json()) as Record<string, unknown>;
  } finally {
    clearTimeout(timeout);
  }
}

function stripTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function fromSmartConfiguration(doc: Record<string, unknown>): SmartConfiguration | undefined {
  const authorizationEndpoint = doc.authorization_endpoint;
  const tokenEndpoint = doc.token_endpoint;
  if (typeof authorizationEndpoint !== "string" || typeof tokenEndpoint !== "string") {
    return undefined;
  }
  const revocationEndpoint = typeof doc.revocation_endpoint === "string" ? doc.revocation_endpoint : undefined;
  return {
    authorizationEndpoint,
    tokenEndpoint,
    raw: doc,
    ...(revocationEndpoint !== undefined ? { revocationEndpoint } : {}),
  };
}

function fromCapabilityStatement(doc: Record<string, unknown>): SmartConfiguration | undefined {
  const rest = doc.rest;
  if (!Array.isArray(rest) || rest.length === 0) return undefined;
  const security = (rest[0] as Record<string, unknown>)?.security as Record<string, unknown> | undefined;
  const extensions = security?.extension;
  if (!Array.isArray(extensions)) return undefined;
  const oauthUris = extensions.find(
    (ext: Record<string, unknown>) => ext?.url === OAUTH_URIS_EXTENSION,
  ) as Record<string, unknown> | undefined;
  const subExtensions = oauthUris?.extension;
  if (!Array.isArray(subExtensions)) return undefined;

  const findUri = (name: string): string | undefined =>
    (subExtensions.find((ext: Record<string, unknown>) => ext?.url === name) as
      | Record<string, unknown>
      | undefined)?.valueUri as string | undefined;

  const authorizationEndpoint = findUri("authorize");
  const tokenEndpoint = findUri("token");
  if (!authorizationEndpoint || !tokenEndpoint) return undefined;
  const revocationEndpoint = findUri("revoke");
  return {
    authorizationEndpoint,
    tokenEndpoint,
    raw: doc,
    ...(revocationEndpoint !== undefined ? { revocationEndpoint } : {}),
  };
}

/** Discovers the authorization/token endpoints for a FHIR server. Tries
 * `.well-known/smart-configuration` first; if that is unreachable or
 * missing the required fields, falls back to parsing the
 * CapabilityStatement at `/metadata`. Throws `DiscoveryError` if both
 * fail, per handover §9.3 ("if both fail, error clearly"). */
export async function discover(iss: string, options: FetchJsonOptions = {}): Promise<SmartConfiguration> {
  const base = stripTrailingSlash(iss);

  let wellKnownError: unknown;
  try {
    const doc = await fetchJson(`${base}/.well-known/smart-configuration`, options);
    const config = fromSmartConfiguration(doc);
    if (config) return config;
    wellKnownError = new Error("smart-configuration response is missing authorization_endpoint/token_endpoint");
  } catch (err) {
    wellKnownError = err;
  }

  try {
    const doc = await fetchJson(`${base}/metadata`, options);
    const config = fromCapabilityStatement(doc);
    if (config) return config;
    throw new Error("CapabilityStatement is missing the SMART oauth-uris extension");
  } catch (metadataError) {
    throw new DiscoveryError(
      `Unable to discover SMART endpoints for "${iss}": ` +
        `.well-known/smart-configuration failed (${(wellKnownError as Error)?.message ?? wellKnownError}), ` +
        `and /metadata fallback failed (${(metadataError as Error)?.message ?? metadataError})`,
      { wellKnownError, metadataError },
    );
  }
}
