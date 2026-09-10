import { NextResponse } from "next/server";
import { bootstrap } from "@/lib/bootstrap";
import { createDataset, listDatasets, listVideos } from "@/lib/training/repo";
import { getTrainingProvider } from "@/lib/training/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  bootstrap();
  return NextResponse.json({ datasets: listDatasets() });
}

/** Snapshot the currently-marked videos into a new, immutable dataset version
 * (brief §8.5 — dataset versions are kept so you can tell if more data helped). */
export async function POST() {
  bootstrap();
  const marked = listVideos().filter((v) => v.in_dataset);
  if (marked.length === 0) {
    return NextResponse.json({ error: 'no videos marked "Add to Training Dataset"' }, { status: 400 });
  }
  const stats = await getTrainingProvider().buildDataset(marked);
  const dataset = createDataset({
    videoIds: marked.map((v) => v.id),
    clipCount: stats.clipCount,
    speechSeconds: stats.speechSeconds,
    frameCount: stats.frameCount,
    faceOkRatio: stats.faceOkRatio,
  });
  return NextResponse.json({ dataset }, { status: 201 });
}
