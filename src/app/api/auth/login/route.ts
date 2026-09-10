import { NextRequest, NextResponse } from "next/server";
import { isPasswordCorrect, rateLimited } from "@/lib/auth";
import { SESSION_COOKIE, issueSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "too many attempts, wait a few minutes" }, { status: 429 });
  }

  let password = "";
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    password = (await req.json().catch(() => ({})))?.password ?? "";
  } else {
    const form = await req.formData();
    password = String(form.get("password") ?? "");
  }

  if (!isPasswordCorrect(password)) {
    return NextResponse.json({ error: "wrong password" }, { status: 401 });
  }

  const session = await issueSession();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, session.value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: session.maxAgeSeconds,
  });
  return res;
}
