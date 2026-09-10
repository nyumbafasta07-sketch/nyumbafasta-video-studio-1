/**
 * Password check for the single-user gate.
 * Hash format: scrypt:N:r:p:saltB64:hashB64
 * ":" (not the PHC "$") is the delimiter so the value is safe to paste into a
 * .env file — dotenv loaders expand "$name" references.
 * Generate with: npm run hash-password -- "your-password"
 */
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const N = 16384;
const r = 8;
const p = 1;
const KEYLEN = 64;

export function hashPassword(password: string, saltB64?: string): string {
  const salt = saltB64 ? Buffer.from(saltB64, "base64") : randomBytes(16);
  const hash = scryptSync(password, salt, KEYLEN, { N, r, p });
  return `scrypt:${N}:${r}:${p}:${salt.toString("base64")}:${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(":");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nStr, rStr, pStr, saltB64, hashB64] = parts;
  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(hashB64, "base64");
  const actual = scryptSync(password, salt, expected.length, {
    N: Number(nStr),
    r: Number(rStr),
    p: Number(pStr),
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function isPasswordCorrect(password: string): boolean {
  const stored = process.env.APP_PASSWORD_HASH ?? "";
  if (!stored) {
    // No hash configured: refuse all logins rather than allowing everyone.
    return false;
  }
  return verifyPassword(password, stored);
}

/* ---- simple in-process login rate limiting (brief SECURITY.md) ---- */

const attempts = new Map<string, number[]>();
const WINDOW_MS = 5 * 60 * 1000;
const MAX_IN_WINDOW = 10;

export function rateLimited(key: string): boolean {
  const now = Date.now();
  const list = (attempts.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  attempts.set(key, list);
  return list.length > MAX_IN_WINDOW;
}
