import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { bootstrap } from "@/lib/bootstrap";
import { createTrainingJob, getDataset, listTrainingJobs } from "@/lib/training/repo";
import { enqueueTraining } from "@/lib/training/orchestrator";
import { PROFILES } from "@/lib/training/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  bootstrap();
  return NextResponse.json({ jobs: listTrainingJobs() });
}

const Body = z.object({
  profile: z.enum(["voice", "speaking_style", "face_identity", "face_performance"]),
  datasetId: z.string().min(1),
  baseModel: z.string().max(200).optional().default(""),
  level: z.number().int().min(1).max(6).optional(),
});

export async function POST(req: NextRequest) {
  bootstrap();
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { profile, datasetId, baseModel } = parsed.data;
  if (!getDataset(datasetId)) {
    return NextResponse.json({ error: "dataset not found" }, { status: 404 });
  }
  const level = parsed.data.level ?? PROFILES.find((p) => p.key === profile)!.level;
  const job = createTrainingJob({ profile, level, datasetId, baseModel });
  enqueueTraining(job.id);
  return NextResponse.json({ job }, { status: 201 });
}
