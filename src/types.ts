/**
 * Shared types for the SMART on FHIR launch flow.
 *
 * Field/claim names here are grounded in the SMART App Launch
 * Implementation Guide and the OAuth2 Authorization Code Grant (RFC 6749)
 * + PKCE (RFC 7636). Confirm against the current published SMART App
 * Launch spec before changing any claim or parameter name.
 */

/** Client configuration required to initiate a launch. No field defaults
 * to a value that resembles a real vendor client_id/secret — every
 * example in docs/tests uses an obviously-placeholder value. */
export interface LaunchConfig {
  /** OAuth2 client_id registered with the FHIR authorization server. */
  clientId: string;
  /** Scopes requested, e.g. ["openid", "fhirUser", "patient/*.read"]. */
  scopes: string[];
  /** Redirect URI registered with the authorization server. */
  redirectUri: string;
  /**
   * FHIR server base URL (the `iss`). Required for standalone launch;
   * for EHR launch this is provided at runtime via the `iss` query
   * parameter instead, so it is optional here.
   */
  iss?: string;
  /**
   * Confidential client secret. Only set for confidential clients that
   * can protect a secret (e.g. a confidential backend). Public clients
   * (SPAs, mobile apps) must leave this unset and rely on PKCE alone.
   */
  clientSecret?: string;
}

/** Discovered OAuth2 endpoints for a FHIR server, per SMART App Launch
 * §"Discovery" (.well-known/smart-configuration, or the CapabilityStatement
 * fallback). */
export interface SmartConfiguration {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  /** Present when the server advertises revocation support. */
  revocationEndpoint?: string;
  /** Raw capabilities/scopes_supported etc., passed through untyped since
   * this library only depends on the two endpoints above. */
  raw: Record<string, unknown>;
}

/** A PKCE verifier/challenge pair (RFC 7636, S256 method only — the
 * `plain` method is intentionally not implemented). */
export interface PkcePair {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
}

/** Raw token endpoint response fields, per SMART App Launch + OAuth2. */
export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  scope?: string;
  refresh_token?: string;
  id_token?: string;
  patient?: string;
  encounter?: string;
  fhirUser?: string;
  need_patient_banner?: boolean;
  smart_style_url?: string;
  [claim: string]: unknown;
}

/** Typed launch-context claims parsed out of a TokenResponse. Every field
 * is optional — a standalone launch (or a server that omits a claim)
 * must not cause a parsing failure. */
export interface LaunchContext {
  patient?: string;
  encounter?: string;
  fhirUser?: string;
  needPatientBanner?: boolean;
  smartStyleUrl?: string;
}

/** A token plus bookkeeping needed to decide when to refresh it. */
export interface StoredToken {
  accessToken: string;
  tokenType: string;
  refreshToken?: string;
  idToken?: string;
  scope?: string;
  /** Epoch milliseconds when the access token expires. Absent when the
   * server did not return `expires_in`. */
  expiresAt?: number;
  context: LaunchContext;
}

/** Pluggable token persistence. Only an in-memory reference
 * implementation ships with this package — see storage.ts. Production
 * consumers must supply their own backend (database, secret manager,
 * encrypted session store, etc.). */
export interface TokenStorage {
  get(key: string): Promise<StoredToken | undefined>;
  set(key: string, token: StoredToken): Promise<void>;
  delete(key: string): Promise<void>;
}

/** State persisted between the authorization redirect and the callback.
 * The host application is responsible for storing this (session,
 * signed cookie, etc.) and handing it back to `handle*Callback`. */
export interface PendingLaunch {
  state: string;
  codeVerifier: string;
  iss: string;
  /** Token endpoint discovered at redirect-build time, carried forward
   * so the callback step doesn't need to re-run discovery. */
  tokenEndpoint: string;
  redirectUri: string;
  /** Present only for EHR launches. */
  launch?: string;
}

/** Raw query parameters received on the OAuth2 callback. Typed as
 * `| undefined` (not just optional) since these are read directly off
 * an HTTP query string parser, where an absent key and an explicit
 * `undefined` are equivalent. */
export interface CallbackParams {
  code?: string | undefined;
  state?: string | undefined;
  error?: string | undefined;
  error_description?: string | undefined;
}

/** Result of building an authorization redirect: the URL to send the
 * browser to, plus the state the host app must persist for the
 * callback step. */
export interface AuthorizationRequest {
  authorizationUrl: string;
  pending: PendingLaunch;
}
