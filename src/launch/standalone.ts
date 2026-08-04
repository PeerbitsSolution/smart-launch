/**
 * Standalone launch flow (handover FR2 / §7.3): the app is launched
 * outside of an EHR session and already knows which FHIR server to talk
 * to (`config.iss`). Same discovery/PKCE/token-exchange path as the EHR
 * flow, minus the `launch` parameter and any launch-context claims.
 *
 * A typical patient-facing standalone launch requests scopes such as
 * `openid`, `fhirUser`, and `patient/*.read` — see
 * docs/examples/standalone-launch for a worked example. This library
 * does not hardcode any particular scope; `config.scopes` is always
 * caller-supplied (handover FR5).
 *
 * needs human security review: shares the state/PKCE handling with the
 * EHR flow — see launch/ehr.ts.
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
 * Builds the authorization redirect for a standalone launch.
 * `config.iss` must be set — standalone launches are configured with a
 * known FHIR server rather than receiving one from an EHR.
 */
export async function buildStandaloneAuthorizationRequest(config: LaunchConfig): Promise<AuthorizationRequest> {
  if (!isNonEmptyString(config.iss)) {
    throw new MissingLaunchParameterError("iss");
  }

  const iss = config.iss;
  const smartConfig = await discover(iss);
  const pkce = createPkcePair();
  const state = generateState();

  const authorizationUrl = new URL(smartConfig.authorizationEndpoint);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("client_id", config.clientId);
  authorizationUrl.searchParams.set("redirect_uri", config.redirectUri);
  authorizationUrl.searchParams.set("aud", iss);
  authorizationUrl.searchParams.set("scope", config.scopes.join(" "));
  authorizationUrl.searchParams.set("state", state);
  authorizationUrl.searchParams.set("code_challenge", pkce.codeChallenge);
  authorizationUrl.searchParams.set("code_challenge_method", pkce.codeChallengeMethod);

  const pending: PendingLaunch = {
    state,
    codeVerifier: pkce.codeVerifier,
    iss,
    tokenEndpoint: smartConfig.tokenEndpoint,
    redirectUri: config.redirectUri,
  };

  return { authorizationUrl: authorizationUrl.toString(), pending };
}

/** Validates the callback and exchanges the authorization code for a
 * token. Identical contract to `handleEhrCallback` — standalone and EHR
 * launches only differ before this point. */
export async function handleStandaloneCallback(
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
