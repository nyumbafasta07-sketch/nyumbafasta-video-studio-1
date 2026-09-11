import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { bootstrap } from "@/lib/bootstrap";
import { saveGpuProfile, redactedRuntimeConfig, type GpuProfileName } from "@/lib/runtime-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  name: z.enum(["colab", "kaggle", "local"]),
  url: z.string().max(500).optional(),
  token: z.string().max(500).optional(), // "" / omitted = leave unchanged
});

/** Save (upsert) a named worker profile's URL/token without activating it. */
export async function POST(req: NextRequest) {
  bootstrap();
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { name, url, token } = parsed.data;
  if (url && !/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: "worker URL must start with http:// or https://" }, { status: 400 });
  }
  saveGpuProfile(name as GpuProfileName, { url, token });
  return NextResponse.json({ config: redactedRuntimeConfig() });
}
