import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, isPasswordCorrect, rateLimited } from "@/lib/auth";
import { issueSession, verifySession } from "@/lib/session";

describe("password hashing", () => {
  it("verifies a correct password and rejects a wrong one", () => {
    const stored = hashPassword("hujambo-2026");
    expect(verifyPassword("hujambo-2026", stored)).toBe(true);
    expect(verifyPassword("wrong", stored)).toBe(false);
  });

  it("rejects a malformed hash", () => {
    expect(verifyPassword("x", "not-a-hash")).toBe(false);
  });

  it("isPasswordCorrect refuses all logins when no hash is configured", () => {
    const prev = process.env.APP_PASSWORD_HASH;
    delete process.env.APP_PASSWORD_HASH;
    expect(isPasswordCorrect("anything")).toBe(false);
    if (prev) process.env.APP_PASSWORD_HASH = prev;
  });

  it("isPasswordCorrect honours a configured hash", () => {
    const prev = process.env.APP_PASSWORD_HASH;
    process.env.APP_PASSWORD_HASH = hashPassword("sahihi");
    expect(isPasswordCorrect("sahihi")).toBe(true);
    expect(isPasswordCorrect("sio-sahihi")).toBe(false);
    if (prev) process.env.APP_PASSWORD_HASH = prev;
    else delete process.env.APP_PASSWORD_HASH;
  });
});

describe("session cookie", () => {
  it("round-trips a signed session", async () => {
    const { value } = await issueSession();
    expect(await verifySession(value)).toBe(true);
  });

  it("rejects a tampered or empty session", async () => {
    const { value } = await issueSession();
    expect(await verifySession(value.replace(/.$/, "x"))).toBe(false);
    expect(await verifySession(undefined)).toBe(false);
    expect(await verifySession("")).toBe(false);
    expect(await verifySession("123.abc")).toBe(false);
  });
});

describe("login rate limiting", () => {
  it("trips after enough attempts in the window", () => {
    const key = `k-${Math.random()}`;
    let tripped = false;
    for (let i = 0; i < 15; i++) tripped = rateLimited(key);
    expect(tripped).toBe(true);
  });
});
