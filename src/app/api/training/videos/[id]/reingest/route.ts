import { NextRequest, NextResponse } from "next/server";
import { bootstrap } from "@/lib/bootstrap";
import { getVideo, updateVideoQuality } from "@/lib/training/repo";
import { enqueueIngest } from "@/lib/training/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Re-run quality analysis on an already-uploaded video without re-uploading
 * it — useful whenever the ingestion pipeline itself improves (a worker fix,
 * a bigger Whisper model, …) and old results need refreshing without costing
 * the founder another slow upload over a weak connection.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  bootstrap();
  const video = getVideo(params.id);
  if (!video) return NextResponse.json({ error: "not found" }, { status: 404 });

  updateVideoQuality(video.id, { qualityScore: null, qualityStatus: "PENDING" });
  enqueueIngest(video.id, {
    filename: video.filename,
    bytes: video.bytes,
    mime: video.mime,
    localPath: video.path,
  });

  return NextResponse.json({ video: getVideo(video.id) });
}
