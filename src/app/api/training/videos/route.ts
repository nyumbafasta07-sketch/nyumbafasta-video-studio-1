import { NextRequest, NextResponse } from "next/server";
import { bootstrap } from "@/lib/bootstrap";
import { getStorage } from "@/lib/storage";
import { addVideo, listVideos } from "@/lib/training/repo";
import { enqueueIngest } from "@/lib/training/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 500 * 1024 * 1024;

export async function GET() {
  bootstrap();
  return NextResponse.json({ videos: listVideos() });
}

/**
 * Upload an authorized recording. The upload itself only writes to local
 * storage and always succeeds — it never depends on a remote GPU worker being
 * reachable. Quality analysis (ingest, possibly on a remote worker over the
 * network) runs afterwards, in the background; the video starts out PENDING
 * and updates when that finishes (brief §8.2). The video is NOT added to the
 * training dataset until the founder explicitly marks it.
 */
export async function POST(req: NextRequest) {
  bootstrap();
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "file too large (max 500 MB)" }, { status: 413 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const safe = file.name.replace(/[^\w.\- ]+/g, "_");
  const rel = `raw/${Date.now()}_${safe}`;
  await getStorage().put({ path: rel, data: buf, mime: file.type || "video/mp4" });

  const video = addVideo({
    filename: file.name,
    path: rel,
    bytes: buf.byteLength,
    mime: file.type || "video/mp4",
    qualityScore: null,
    qualityStatus: "PENDING",
    meta: {},
  });

  enqueueIngest(video.id, {
    filename: file.name,
    bytes: buf.byteLength,
    mime: file.type || "video/mp4",
    localPath: rel,
  });

  return NextResponse.json({ video }, { status: 201 });
}
