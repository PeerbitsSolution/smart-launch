import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { createPkcePair, deriveCodeChallenge, verifyPkcePair, generateState, generateNonce } from "../src/pkce";

describe("pkce", () => {
  it("generates a code_verifier within the RFC 7636 length range (43-128 chars)", () => {
    const { codeVerifier } = createPkcePair();
    expect(codeVerifier.length).toBeGreaterThanOrEqual(43);
    expect(codeVerifier.length).toBeLessThanOrEqual(128);
  });

  it("generates a code_verifier using only the RFC 7636 unreserved charset", () => {
    const { codeVerifier } = createPkcePair();
    expect(codeVerifier).toMatch(/^[A-Za-z0-9\-._~]+$/);
  });

  it("always reports S256 as the challenge method", () => {
    const { codeChallengeMethod } = createPkcePair();
    expect(codeChallengeMethod).toBe("S256");
  });

  it("derives code_challenge as BASE64URL(SHA256(code_verifier)), per RFC 7636 §4.2", () => {
    const codeVerifier = "test-verifier-value-1234567890-abcdefghij";
    const expected = createHash("sha256").update(codeVerifier, "ascii").digest("base64url");
    expect(deriveCodeChallenge(codeVerifier)).toBe(expected);
  });

  it("produces a pair where the challenge matches the verifier", () => {
    const pair = createPkcePair();
    expect(deriveCodeChallenge(pair.codeVerifier)).toBe(pair.codeChallenge);
  });

  it("verifyPkcePair returns true for a matching verifier/challenge", () => {
    const pair = createPkcePair();
    expect(verifyPkcePair(pair.codeVerifier, pair.codeChallenge)).toBe(true);
  });

  it("verifyPkcePair returns false for a mismatched verifier", () => {
    const pair = createPkcePair();
    expect(verifyPkcePair("a-completely-different-verifier-value-here", pair.codeChallenge)).toBe(false);
  });

  it("generates a fresh code_verifier on every call", () => {
    const a = createPkcePair();
    const b = createPkcePair();
    expect(a.codeVerifier).not.toBe(b.codeVerifier);
  });

  it("generates state values that are non-empty and unique per call", () => {
    const a = generateState();
    const b = generateState();
    expect(a).toBeTruthy();
    expect(a).not.toBe(b);
  });

  it("generates nonce values that are non-empty and unique per call", () => {
    const a = generateNonce();
    const b = generateNonce();
    expect(a).toBeTruthy();
    expect(a).not.toBe(b);
  });
});
