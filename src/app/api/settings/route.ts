import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { bootstrap } from "@/lib/bootstrap";
import { config } from "@/lib/config";
import { getSetting, setSetting } from "@/lib/repo";
import { redactedRuntimeConfig, setRuntimeConfig } from "@/lib/runtime-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  bootstrap();
  return NextResponse.json({
    config: redactedRuntimeConfig(),
    ownerLabel: getSetting("owner_label") ?? "Founder",
    output: config.output,
    storageDir: config.storageDir,
    databaseFile: config.databaseFile,
    passwordHashConfigured: config.passwordHashConfigured,
  });
}

const Body = z.object({
  gpuProvider: z.enum(["local-mock", "http"]).optional(),
  gpuWorkerUrl: z.string().max(500).optional(),
  gpuWorkerToken: z.string().max(500).optional(), // "" = leave unchanged
  trainingProvider: z.enum(["mock", "worker"]).optional(),
  ownerLabel: z.string().min(1).max(100).optional(),
});

export async function POST(req: NextRequest) {
  bootstrap();
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { ownerLabel, ...rt } = parsed.data;

  if (rt.gpuWorkerUrl && !/^https?:\/\//i.test(rt.gpuWorkerUrl)) {
    return NextResponse.json({ error: "worker URL must start with http:// or https://" }, { status: 400 });
  }
  if ((rt.gpuProvider === "http" || rt.trainingProvider === "worker")) {
    const url = rt.gpuWorkerUrl ?? redactedRuntimeConfig().gpuWorkerUrl;
    if (!url) {
      return NextResponse.json(
        { error: "set a worker URL before switching to http / worker" },
        { status: 400 },
      );
    }
  }

  setRuntimeConfig(rt);
  if (ownerLabel) setSetting("owner_label", ownerLabel);
  return NextResponse.json({ config: redactedRuntimeConfig() });
}
