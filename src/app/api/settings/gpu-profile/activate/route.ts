import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { bootstrap } from "@/lib/bootstrap";
import { activateGpuProfile, redactedRuntimeConfig } from "@/lib/runtime-config";
import { listVersions } from "@/lib/training/repo";
import { loadModelBundle } from "@/lib/training/model-bundles";
import { getTrainingProvider } from "@/lib/training/provider";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ id: z.string().min(1).max(200) });

/** Switch the active GPU/training worker to a previously-saved profile —
 * copies its stored URL/token into the single active fields everything else
 * reads, and flips both providers to http/worker. No re-typing needed.
 *
 * Also re-provisions the PRODUCTION voice model onto the newly-active
 * worker, if we have one saved — every worker session is ephemeral, so
 * without this, switching GPUs (Colab limit hit, Kaggle unavailable, …)
 * would mean the founder's trained voice is simply gone until retrained. */
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

  let restored: string | null = null;
  try {
    const provider = getTrainingProvider();
    if (provider.importModel) {
      const voiceProd = listVersions("voice").find((v) => v.status === "production");
      const modelRef = voiceProd ? String(voiceProd.config?.modelRef ?? "") : "";
      if (modelRef) {
        const bundle = await loadModelBundle("voice", modelRef);
        if (bundle) {
          await provider.importModel("voice", modelRef, bundle);
          restored = modelRef;
        }
      }
    }
  } catch (e) {
    // Don't fail the switch over this — the founder can retrain/export again;
    // just log it so it's visible if voice generation then comes up empty.
    logger.error("model re-provisioning failed after GPU profile switch", { error: String(e) });
  }

  return NextResponse.json({ config: redactedRuntimeConfig(), restoredVoiceModel: restored });
}
