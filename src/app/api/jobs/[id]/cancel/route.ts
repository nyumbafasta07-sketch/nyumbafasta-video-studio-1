import { NextRequest, NextResponse } from "next/server";
import { bootstrap } from "@/lib/bootstrap";
import { getJob, updateJob, NON_TERMINAL_STATES } from "@/lib/repo";
import { logger } from "@/lib/logger";
import { nowIso } from "@/lib/ids";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Request cancellation. The orchestrator checks for CANCELLED between stages
 * and stops (brief §7). */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  bootstrap();
  const job = getJob(params.id);
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!NON_TERMINAL_STATES.includes(job.state)) {
    return NextResponse.json({ error: `job already ${job.state}` }, { status: 409 });
  }
  const updated = updateJob(job.id, {
    state: "CANCELLED",
    stage_status: "error",
    error: "cancelled by user",
    ended_at: nowIso(),
  });
  logger.job("cancel_requested", { projectId: job.project_id, jobId: job.id });
  return NextResponse.json({ job: updated });
}
