import { NextRequest, NextResponse } from "next/server";
import { bootstrap } from "@/lib/bootstrap";
import { getJob, updateJob } from "@/lib/repo";
import { enqueue } from "@/lib/pipeline/runner";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Re-run a FAILED or CANCELLED job. Completed stages are skipped via their
 * isDone() checks, so it resumes from where it broke (brief §7). */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  bootstrap();
  const job = getJob(params.id);
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (job.state !== "FAILED" && job.state !== "CANCELLED") {
    return NextResponse.json({ error: `job is ${job.state}, not retryable` }, { status: 409 });
  }

  // drop the progress entry for the stage that failed so it re-runs
  const progress = { ...job.progress };
  if (job.stage && progress[job.stage]) delete progress[job.stage];

  updateJob(job.id, {
    state: "QUEUED",
    stage_status: "pending",
    attempt: 0,
    error: null,
    ended_at: null,
    progress,
  });
  enqueue(job.id);
  logger.job("retry_requested", { projectId: job.project_id, jobId: job.id, stage: job.stage });
  return NextResponse.json({ job: getJob(job.id) });
}
