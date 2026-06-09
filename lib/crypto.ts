import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

/**
 * Crypto helpers shared across auth, OAuth, and pay flows.
 *
 * Tokens, auth codes, and client secrets are high-entropy random strings, so a
 * single SHA-256 (no per-record salt) is sufficient and lets us store + compare
 * them in constant time. Never store the plaintext.
 */

/** A URL-safe random token. 32 bytes ≈ 256 bits of entropy. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Hash used to store access/refresh tokens and authorization codes. */
export const hashToken = sha256;

/** Constant-time string comparison that tolerates length mismatch. */
export function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Verify a PKCE code_verifier against an S256 code_challenge (RFC 7636). */
export function verifyPkceS256(verifier: string, challenge: string): boolean {
  const computed = createHash("sha256").update(verifier).digest("base64url");
  return timingSafeEqualStr(computed, challenge);
}

export function hashSecret(secret: string): string {
  return sha256(secret);
}

export function verifySecret(secret: string, hash: string): boolean {
  return timingSafeEqualStr(sha256(secret), hash);
}

/** HMAC-SHA256 signature (base64url) — used for signed pay receipts. */
export function hmacSign(data: string, key: string): string {
  return createHmac("sha256", key).update(data).digest("base64url");
}

export function hmacVerify(data: string, key: string, signature: string): boolean {
  return timingSafeEqualStr(hmacSign(data, key), signature);
}
