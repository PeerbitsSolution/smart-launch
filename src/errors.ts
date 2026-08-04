/**
 * Typed error hierarchy for the launch flow. Callers should catch
 * `SmartLaunchError` (or a specific subclass) rather than parsing
 * error message strings.
 */

export class SmartLaunchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Discovery of the FHIR server's OAuth2 endpoints failed — both
 * .well-known/smart-configuration and the CapabilityStatement fallback
 * were unreachable or unparsable. */
export class DiscoveryError extends SmartLaunchError {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
  }
}

/** Thrown before any redirect when a required launch parameter is
 * missing or invalid (e.g. `iss` missing on an EHR launch). Fails fast,
 * per handover §9.3 — never proceed to a redirect on bad input. */
export class MissingLaunchParameterError extends SmartLaunchError {
  constructor(public readonly parameter: string) {
    super(`Missing or invalid required launch parameter: ${parameter}`);
  }
}

/** The `state` returned on callback does not match the one persisted
 * before the redirect. This is a CSRF signal — never proceed to token
 * exchange when this is thrown. */
export class StateMismatchError extends SmartLaunchError {
  constructor() {
    super("state parameter on callback does not match the persisted value");
  }
}

/** PKCE verification failed (code_verifier did not satisfy the
 * code_challenge previously sent). */
export class PkceValidationError extends SmartLaunchError {
  constructor(message = "PKCE code_verifier failed to validate against the persisted code_challenge") {
    super(message);
  }
}

/** The token endpoint returned an OAuth2 error response
 * (RFC 6749 §5.2 — e.g. invalid_grant, invalid_client). Carries the
 * server's `error` and optional `error_description` verbatim so callers
 * can branch on the OAuth2 error code rather than a message string. */
export class TokenExchangeError extends SmartLaunchError {
  constructor(
    public readonly error: string,
    public readonly errorDescription?: string,
    public readonly status?: number,
  ) {
    super(`token endpoint returned error: ${error}${errorDescription ? ` (${errorDescription})` : ""}`);
  }
}

/** A refresh attempt failed because there was no refresh token stored,
 * or the stored refresh token was rejected by the server. Host apps
 * should treat this as "re-trigger launch". */
export class RefreshFailedError extends SmartLaunchError {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
  }
}
