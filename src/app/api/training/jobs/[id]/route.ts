import { NextRequest, NextResponse } from "next/server";
import { bootstrap } from "@/lib/bootstrap";
import { getTrainingJob, getVersion } from "@/lib/training/repo";
import { sweepTraining } from "@/lib/training/orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STAGE_ORDER = [
  "preprocessing",
  "transcribing",
  "building_dataset",
  "training",
  "evaluating",
];

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  bootstrap();
  sweepTraining();
  const job = getTrainingJob(params.id);
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({
    job,
    stages: STAGE_ORDER.map((k) => ({
      key: k,
      progress: job.progress[k] ?? { status: "pending", attempt: 0 },
    })),
    version: job.result_version_id ? getVersion(job.result_version_id) : null,
  });
}
