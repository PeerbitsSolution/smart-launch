/**
 * EHR launch flow (handover FR1 / §7.3): the app is opened from inside
 * an EHR session and receives `iss` + `launch` query parameters.
 *
 * needs human security review: builds the authorization redirect and
 * validates the callback's `state` — a CSRF-relevant path.
 */
import { discover } from "../discovery.js";
import { createPkcePair, generateState } from "../pkce.js";
import { exchangeCodeForToken } from "../token.js";
import {
  MissingLaunchParameterError,
  StateMismatchError,
  TokenExchangeError,
} from "../errors.js";
import type {
  AuthorizationRequest,
  CallbackParams,
  LaunchConfig,
  PendingLaunch,
  StoredToken,
} from "../types.js";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Step 1-3 of the EHR launch sequence (handover §7.3): validate the
 * incoming `iss`/`launch` parameters, discover the FHIR server's OAuth2
 * endpoints, and build the authorization redirect URL.
 *
 * Fails fast (before any redirect) if `iss` or `launch` is missing, per
 * handover §9.3.
 */
export async function buildEhrAuthorizationRequest(
  queryParams: { iss?: string | undefined; launch?: string | undefined },
  config: LaunchConfig,
): Promise<AuthorizationRequest> {
  if (!isNonEmptyString(queryParams.iss)) {
    throw new MissingLaunchParameterError("iss");
  }
  if (!isNonEmptyString(queryParams.launch)) {
    throw new MissingLaunchParameterError("launch");
  }

  const iss = queryParams.iss;
  const launch = queryParams.launch;

  const smartConfig = await discover(iss);
  const pkce = createPkcePair();
  const state = generateState();

  // EHR launch requires the "launch" scope in addition to whatever
  // clinical/identity scopes the app requests (SMART App Launch spec).
  const scopes = config.scopes.includes("launch") ? config.scopes : [...config.scopes, "launch"];

  const authorizationUrl = new URL(smartConfig.authorizationEndpoint);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("client_id", config.clientId);
  authorizationUrl.searchParams.set("redirect_uri", config.redirectUri);
  authorizationUrl.searchParams.set("launch", launch);
  authorizationUrl.searchParams.set("aud", iss);
  authorizationUrl.searchParams.set("scope", scopes.join(" "));
  authorizationUrl.searchParams.set("state", state);
  authorizationUrl.searchParams.set("code_challenge", pkce.codeChallenge);
  authorizationUrl.searchParams.set("code_challenge_method", pkce.codeChallengeMethod);

  const pending: PendingLaunch = {
    state,
    codeVerifier: pkce.codeVerifier,
    iss,
    tokenEndpoint: smartConfig.tokenEndpoint,
    redirectUri: config.redirectUri,
    launch,
  };

  return { authorizationUrl: authorizationUrl.toString(), pending };
}

/**
 * Steps 4-7 of the EHR launch sequence: validate the callback's `state`
 * (CSRF check — never proceed to token exchange on mismatch), then
 * exchange the authorization code for a token.
 */
export async function handleEhrCallback(
  callbackParams: CallbackParams,
  pending: PendingLaunch,
  config: LaunchConfig,
): Promise<StoredToken> {
  if (callbackParams.error) {
    throw new TokenExchangeError(callbackParams.error, callbackParams.error_description);
  }
  if (callbackParams.state !== pending.state) {
    throw new StateMismatchError();
  }
  if (!isNonEmptyString(callbackParams.code)) {
    throw new MissingLaunchParameterError("code");
  }

  return exchangeCodeForToken(config, pending.tokenEndpoint, callbackParams.code, pending.codeVerifier);
}
