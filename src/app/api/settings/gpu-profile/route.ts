import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { bootstrap } from "@/lib/bootstrap";
import { saveGpuProfile, deleteGpuProfile, redactedRuntimeConfig } from "@/lib/runtime-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  id: z.string().min(1).max(200).optional(), // omitted = create a new profile
  label: z.string().min(1).max(60),
  url: z.string().max(500).optional(),
  token: z.string().max(500).optional(), // "" / omitted = leave unchanged
});

/** Save (create or update) a named worker profile's URL/token without activating it. */
export async function POST(req: NextRequest) {
  bootstrap();
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { id, label, url, token } = parsed.data;
  if (url && !/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: "worker URL must start with http:// or https://" }, { status: 400 });
  }
  try {
    saveGpuProfile({ id, label, url, token });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  return NextResponse.json({ config: redactedRuntimeConfig() });
}

const DeleteBody = z.object({ id: z.string().min(1).max(200) });

export async function DELETE(req: NextRequest) {
  bootstrap();
  const parsed = DeleteBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  deleteGpuProfile(parsed.data.id);
  return NextResponse.json({ config: redactedRuntimeConfig() });
}
