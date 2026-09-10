import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import { SESSION_COOKIE, issueSession } from "@/lib/session";

function req(path: string, cookie?: string) {
  const r = new NextRequest(new URL(`http://localhost:3000${path}`));
  if (cookie) r.cookies.set(SESSION_COOKIE, cookie);
  return r;
}

describe("middleware gate (brief §3)", () => {
  it("redirects an unauthenticated page request to /login", async () => {
    const res = await middleware(req("/projects"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("401s an unauthenticated API request", async () => {
    const res = await middleware(req("/api/projects"));
    expect(res.status).toBe(401);
  });

  it("lets /login through without a session", async () => {
    const res = await middleware(req("/login"));
    expect(res.headers.get("location")).toBeNull();
  });

  it("lets a valid session through", async () => {
    const { value } = await issueSession();
    const res = await middleware(req("/projects", value));
    expect(res.headers.get("location")).toBeNull();
  });

  it("rejects a tampered session", async () => {
    const { value } = await issueSession();
    const res = await middleware(req("/projects", value.slice(0, -1) + "0"));
    expect(res.status).toBe(307);
  });
});
