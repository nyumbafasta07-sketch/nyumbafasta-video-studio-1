import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { bootstrap } from "@/lib/bootstrap";
import { activateGpuProfile, redactedRuntimeConfig } from "@/lib/runtime-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ id: z.string().min(1).max(200) });

/** Switch the active GPU/training worker to a previously-saved profile —
 * copies its stored URL/token into the single active fields everything else
 * reads, and flips both providers to http/worker. No re-typing needed. */
export async function POST(req: NextRequest) {
  bootstrap();
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  try {
    activateGpuProfile(parsed.data.id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  return NextResponse.json({ config: redactedRuntimeConfig() });
}
