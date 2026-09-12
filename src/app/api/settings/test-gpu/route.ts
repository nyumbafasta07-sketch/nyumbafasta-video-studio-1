import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { bootstrap } from "@/lib/bootstrap";
import { getRuntimeConfig, listGpuProfiles } from "@/lib/runtime-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  url: z.string().optional(),
  token: z.string().optional(),
  /** test a SAVED profile's stored url/token directly — lets the founder
   * test a profile whose token they didn't retype (blank = keep stored) */
  profileId: z.string().optional(),
});

/** Hit the worker's /health so the founder gets real feedback before switching. */
export async function POST(req: NextRequest) {
  bootstrap();
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  const rc = getRuntimeConfig();

  let url = "";
  let token = "";
  const profileId = parsed.success ? parsed.data.profileId : undefined;
  if (profileId) {
    const profile = listGpuProfiles().find((p) => p.id === profileId);
    if (!profile) return NextResponse.json({ ok: false, detail: "profile not found" }, { status: 404 });
    url = profile.url;
    token = profile.token;
  } else {
    url = (parsed.success && parsed.data.url ? parsed.data.url : rc.gpuWorkerUrl).trim();
    token = (parsed.success && parsed.data.token ? parsed.data.token : rc.gpuWorkerToken);
  }
  url = url.trim().replace(/\/$/, "");

  if (!url) return NextResponse.json({ ok: false, detail: "no worker URL" }, { status: 400 });

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(`${url}/health`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
      signal: ctrl.signal,
    });
    const body = await r.text();
    return NextResponse.json({
      ok: r.ok,
      status: r.status,
      detail: body.slice(0, 300),
    });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      detail: e instanceof Error ? e.message : "request failed",
    });
  } finally {
    clearTimeout(t);
  }
}
