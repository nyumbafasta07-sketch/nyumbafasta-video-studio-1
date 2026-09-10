/**
 * HMAC-signed session cookie. No auth library, no user table (brief §3).
 * Payload is just an issued-at timestamp; identity is implicit (single user).
 *
 * Uses Web Crypto (SubtleCrypto) so this module is safe to import from Edge
 * middleware as well as Node route handlers — no `node:` imports here.
 */

export const SESSION_COOKIE = "vs_session";

function secret(): string {
  return process.env.SESSION_SECRET || "dev-insecure-secret-change-me";
}

function ttlMs(): number {
  const hours = Number(process.env.SESSION_TTL_HOURS || "720");
  return (Number.isFinite(hours) ? hours : 720) * 3600 * 1000;
}

const enc = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return toBase64Url(new Uint8Array(sig));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export async function issueSession(): Promise<{ value: string; maxAgeSeconds: number }> {
  const issuedAt = Date.now().toString();
  const value = `${issuedAt}.${await hmac(issuedAt)}`;
  return { value, maxAgeSeconds: Math.floor(ttlMs() / 1000) };
}

export async function verifySession(cookieValue: string | undefined): Promise<boolean> {
  if (!cookieValue) return false;
  const dot = cookieValue.lastIndexOf(".");
  if (dot <= 0) return false;
  const issuedAt = cookieValue.slice(0, dot);
  const provided = cookieValue.slice(dot + 1);
  const expected = await hmac(issuedAt);
  if (!timingSafeEqual(provided, expected)) return false;
  const ageMs = Date.now() - Number(issuedAt);
  if (!Number.isFinite(ageMs) || ageMs < 0) return false;
  return ageMs < ttlMs();
}
