/**
 * Authorization-code-for-token exchange, refresh, and expiry tracking.
 *
 * needs human security review: this module sends the PKCE
 * code_verifier and (for confidential clients) the client_secret to the
 * token endpoint, and is the sole place refresh tokens are persisted via
 * the TokenStorage interface.
 */
import { TokenExchangeError, RefreshFailedError } from "./errors.js";
import { parseLaunchContext } from "./context.js";
import type { LaunchConfig, StoredToken, TokenResponse, TokenStorage } from "./types.js";

const DEFAULT_TIMEOUT_MS = 10_000;
/** Refresh a token this many milliseconds before it actually expires,
 * to absorb clock skew and request latency. */
const DEFAULT_REFRESH_SKEW_MS = 60_000;

interface TokenRequestOptions {
  timeoutMs?: number;
}

async function postForm(tokenEndpoint: string, body: URLSearchParams, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<TokenResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(tokenEndpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body,
    });
  } finally {
    clearTimeout(timeout);
  }

  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  if (!response.ok) {
    const error = typeof json.error === "string" ? json.error : `http_${response.status}`;
    const errorDescription = typeof json.error_description === "string" ? json.error_description : undefined;
    throw new TokenExchangeError(error, errorDescription, response.status);
  }

  if (typeof json.access_token !== "string" || typeof json.token_type !== "string") {
    throw new TokenExchangeError("invalid_response", "token endpoint response is missing access_token/token_type");
  }

  return json as unknown as TokenResponse;
}

function toStoredToken(response: TokenResponse, requestedAt: number): StoredToken {
  return {
    accessToken: response.access_token,
    tokenType: response.token_type,
    context: parseLaunchContext(response),
    ...(response.refresh_token !== undefined ? { refreshToken: response.refresh_token } : {}),
    ...(response.id_token !== undefined ? { idToken: response.id_token } : {}),
    ...(response.scope !== undefined ? { scope: response.scope } : {}),
    ...(typeof response.expires_in === "number"
      ? { expiresAt: requestedAt + response.expires_in * 1000 }
      : {}),
  };
}

/** Exchanges an authorization code + PKCE code_verifier for a token,
 * per SMART App Launch / RFC 6749 §4.1.3 + RFC 7636 §4.5. */
export async function exchangeCodeForToken(
  config: LaunchConfig,
  tokenEndpoint: string,
  code: string,
  codeVerifier: string,
  options: TokenRequestOptions = {},
): Promise<StoredToken> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri,
    client_id: config.clientId,
    code_verifier: codeVerifier,
  });
  if (config.clientSecret) {
    body.set("client_secret", config.clientSecret);
  }

  const requestedAt = Date.now();
  const response = await postForm(tokenEndpoint, body, options.timeoutMs);
  return toStoredToken(response, requestedAt);
}

/** Exchanges a refresh_token for a new access token, per RFC 6749 §6. */
export async function refreshAccessToken(
  config: LaunchConfig,
  tokenEndpoint: string,
  refreshToken: string,
  options: TokenRequestOptions = {},
): Promise<StoredToken> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: config.clientId,
  });
  if (config.clientSecret) {
    body.set("client_secret", config.clientSecret);
  }

  const requestedAt = Date.now();
  try {
    const response = await postForm(tokenEndpoint, body, options.timeoutMs);
    // Servers are not required to re-issue a refresh_token on refresh;
    // carry the previous one forward if the response omits it.
    if (!response.refresh_token) response.refresh_token = refreshToken;
    return toStoredToken(response, requestedAt);
  } catch (err) {
    throw new RefreshFailedError("refresh_token exchange failed — the host app should re-trigger launch", err);
  }
}

export interface EnsureFreshTokenOptions extends TokenRequestOptions {
  /** Refresh this many milliseconds before actual expiry. Defaults to 60s. */
  refreshSkewMs?: number;
  /** Called with the newly refreshed token whenever a refresh happens,
   * so the host app can persist/propagate it (handover FR3: "exposed
   * via a callback/event hook"). */
  onRefresh?: (token: StoredToken) => void | Promise<void>;
}

/** Returns a valid access token for `key`, transparently refreshing it
 * first if it is at or near expiry. Throws `RefreshFailedError` if no
 * token is stored, or if the token is expired/near-expiry with no
 * refresh_token available. */
export async function ensureFreshToken(
  config: LaunchConfig,
  tokenEndpoint: string,
  storage: TokenStorage,
  key: string,
  options: EnsureFreshTokenOptions = {},
): Promise<StoredToken> {
  const stored = await storage.get(key);
  if (!stored) {
    throw new RefreshFailedError(`no token stored for key "${key}"`);
  }

  const skew = options.refreshSkewMs ?? DEFAULT_REFRESH_SKEW_MS;
  const isFresh = stored.expiresAt === undefined || Date.now() < stored.expiresAt - skew;
  if (isFresh) return stored;

  if (!stored.refreshToken) {
    throw new RefreshFailedError(`token for key "${key}" is expired and no refresh_token is available`);
  }

  const refreshed = await refreshAccessToken(config, tokenEndpoint, stored.refreshToken, options);
  await storage.set(key, refreshed);
  await options.onRefresh?.(refreshed);
  return refreshed;
}
