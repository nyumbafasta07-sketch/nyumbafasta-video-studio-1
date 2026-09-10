import { NextRequest, NextResponse } from "next/server";
import { bootstrap } from "@/lib/bootstrap";
import { getStorage } from "@/lib/storage";
import { addVideo, listVideos } from "@/lib/training/repo";
import { getTrainingProvider } from "@/lib/training/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 500 * 1024 * 1024;

export async function GET() {
  bootstrap();
  return NextResponse.json({ videos: listVideos() });
}

/** Upload an authorized recording. Ingestion (quality score) runs via the
 * TrainingProvider. The video is NOT added to the training dataset until the
 * founder explicitly marks it (brief §8.2). Stored under raw/, kept forever. */
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

  const ingest = await getTrainingProvider().ingestVideo({
    filename: file.name,
    bytes: buf.byteLength,
    mime: file.type || "video/mp4",
    localPath: rel,
  });

  const video = addVideo({
    filename: file.name,
    path: rel,
    bytes: buf.byteLength,
    mime: file.type || "video/mp4",
    qualityScore: ingest.qualityScore,
    qualityStatus: ingest.qualityStatus,
    meta: ingest.meta,
  });
  return NextResponse.json({ video }, { status: 201 });
}
