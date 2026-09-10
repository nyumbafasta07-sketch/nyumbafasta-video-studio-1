import { NextRequest, NextResponse } from "next/server";
import { bootstrap } from "@/lib/bootstrap";
import { getJob, getOutputAssetForJob } from "@/lib/repo";
import { sweep } from "@/lib/pipeline/runner";
import { STAGES } from "@/lib/pipeline/stages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  bootstrap();
  sweep(); // pick up jobs stranded by a restart
  const job = getJob(params.id);
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });

  const output = getOutputAssetForJob(job.id);
  return NextResponse.json({
    job,
    stages: STAGES.map((s) => ({
      key: s.key,
      state: s.state,
      progress: job.progress[s.key] ?? { status: "pending", attempt: 0 },
    })),
    output: output
      ? {
          downloadUrl: `/api/jobs/${job.id}/download`,
          bytes: output.bytes,
          meta: output.meta,
        }
      : null,
  });
}
