import { NextRequest, NextResponse } from "next/server";
import { bootstrap } from "@/lib/bootstrap";
import { getTrainingJob, updateTrainingJob } from "@/lib/training/repo";
import { TRAINING_NON_TERMINAL } from "@/lib/training/types";
import { nowIso } from "@/lib/ids";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  bootstrap();
  const job = getTrainingJob(params.id);
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!TRAINING_NON_TERMINAL.includes(job.state)) {
    return NextResponse.json({ error: `job already ${job.state}` }, { status: 409 });
  }
  const updated = updateTrainingJob(job.id, {
    state: "CANCELLED",
    stage_status: "error",
    error: "cancelled by user",
    ended_at: nowIso(),
  });
  return NextResponse.json({ job: updated });
}
