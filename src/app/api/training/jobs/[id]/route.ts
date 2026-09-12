import { NextRequest, NextResponse } from "next/server";
import { bootstrap } from "@/lib/bootstrap";
import { getTrainingJob, getVersion, deleteTrainingJob } from "@/lib/training/repo";
import { TRAINING_NON_TERMINAL } from "@/lib/training/types";
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

/** Remove a job's history entry — only once it's finished (COMPLETED / FAILED
 * / CANCELLED). Just tidies the Recent-jobs list; the trained model version
 * (if any) is untouched, it lives in model_versions, not here. */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  bootstrap();
  const job = getTrainingJob(params.id);
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (TRAINING_NON_TERMINAL.includes(job.state)) {
    return NextResponse.json({ error: `job is ${job.state} — cancel it first` }, { status: 409 });
  }
  deleteTrainingJob(params.id);
  return NextResponse.json({ ok: true });
}
