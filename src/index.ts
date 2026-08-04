/**
 * smart-launch
 * SMART on FHIR authentication & launch flow reference implementation
 *
 * Public API surface — everything a consumer should import lives here.
 * Internal modules (not exported) are not part of the stability contract
 * and can change without a major version bump.
 */

export const VERSION = "0.1.0";

// Discovery
export { discover } from "./discovery.js";

// PKCE
export { createPkcePair, verifyPkcePair, generateState, generateNonce, deriveCodeChallenge } from "./pkce.js";

// Launch flows
export { buildEhrAuthorizationRequest, handleEhrCallback } from "./launch/ehr.js";
export { buildStandaloneAuthorizationRequest, handleStandaloneCallback } from "./launch/standalone.js";

// Token exchange, refresh, and freshness
export { exchangeCodeForToken, refreshAccessToken, ensureFreshToken } from "./token.js";
export type { EnsureFreshTokenOptions } from "./token.js";

// Launch context
export { parseLaunchContext } from "./context.js";

// Storage
export { InMemoryTokenStorage } from "./storage.js";

// Errors
export {
  SmartLaunchError,
  DiscoveryError,
  MissingLaunchParameterError,
  StateMismatchError,
  PkceValidationError,
  TokenExchangeError,
  RefreshFailedError,
} from "./errors.js";

// Types
export type {
  LaunchConfig,
  SmartConfiguration,
  PkcePair,
  TokenResponse,
  LaunchContext,
  StoredToken,
  TokenStorage,
  PendingLaunch,
  CallbackParams,
  AuthorizationRequest,
} from "./types.js";
