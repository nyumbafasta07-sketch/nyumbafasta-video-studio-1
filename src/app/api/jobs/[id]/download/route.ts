import { NextRequest, NextResponse } from "next/server";
import { bootstrap } from "@/lib/bootstrap";
import { getJob, getOutputAssetForJob } from "@/lib/repo";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Auth-gated download. Raw storage paths are never exposed (brief §7, SECURITY.md). */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  bootstrap();
  const job = getJob(params.id);
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });

  const asset = getOutputAssetForJob(job.id);
  if (!asset) return NextResponse.json({ error: "no output yet" }, { status: 404 });

  const storage = getStorage();
  if (!(await storage.exists(asset.path))) {
    return NextResponse.json({ error: "output file missing" }, { status: 410 });
  }
  const buf = await storage.get(asset.path);
  const body = new Uint8Array(buf);
  return new NextResponse(body, {
    headers: {
      "content-type": "video/mp4",
      "content-length": String(body.byteLength),
      "content-disposition": `attachment; filename="video-${job.id}.mp4"`,
      "cache-control": "private, no-store",
    },
  });
}
