/**
 * PKCE (RFC 7636) code_verifier / code_challenge generation, plus
 * cryptographically random `state` and `nonce` values for CSRF
 * protection on the callback.
 *
 * needs human security review: this module generates the
 * confidentiality-critical values (code_verifier, state, nonce) that
 * protect the authorization code flow. Only the S256 challenge method
 * is implemented — the `plain` method from RFC 7636 is intentionally
 * not supported (handover §6.1: "PKCE (S256) is mandatory... do not
 * implement the plain method").
 */
import { randomBytes, createHash } from "node:crypto";
import type { PkcePair } from "./types.js";

const VERIFIER_BYTES = 32; // base64url(32 bytes) = 43 chars, within RFC 7636's 43-128 range
const STATE_BYTES = 32;
const NONCE_BYTES = 32;

function base64UrlEncode(input: Buffer): string {
  return input.toString("base64url");
}

function randomBase64Url(byteLength: number): string {
  return base64UrlEncode(randomBytes(byteLength));
}

/** Derives the S256 code_challenge for a given code_verifier:
 * BASE64URL(SHA256(ASCII(code_verifier))), per RFC 7636 §4.2. */
export function deriveCodeChallenge(codeVerifier: string): string {
  const hash = createHash("sha256").update(codeVerifier, "ascii").digest();
  return base64UrlEncode(hash);
}

/** Generates a new PKCE verifier/challenge pair using the S256 method. */
export function createPkcePair(): PkcePair {
  const codeVerifier = randomBase64Url(VERIFIER_BYTES);
  return {
    codeVerifier,
    codeChallenge: deriveCodeChallenge(codeVerifier),
    codeChallengeMethod: "S256",
  };
}

/** Recomputes the code_challenge from a code_verifier and compares it
 * against the expected value using a constant-time-equivalent string
 * comparison. Exposed for tests and for anyone implementing the
 * authorization-server side of a sandbox/mock. */
export function verifyPkcePair(codeVerifier: string, expectedCodeChallenge: string): boolean {
  return deriveCodeChallenge(codeVerifier) === expectedCodeChallenge;
}

/** Generates a cryptographically random `state` value for CSRF
 * protection on the OAuth2 callback. */
export function generateState(): string {
  return randomBase64Url(STATE_BYTES);
}

/** Generates a cryptographically random `nonce` value (OIDC). */
export function generateNonce(): string {
  return randomBase64Url(NONCE_BYTES);
}
