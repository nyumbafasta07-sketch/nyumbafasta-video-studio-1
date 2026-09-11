import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { bootstrap } from "@/lib/bootstrap";
import { getStorage } from "@/lib/storage";
import { addVideo } from "@/lib/training/repo";
import { enqueueIngest } from "@/lib/training/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 500 * 1024 * 1024;
const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Chunked upload. A single multi-MB request over a weak connection is exactly
 * the kind of thing that fails outright (proxy/connection drop) with no way
 * to retry anything but the whole file. Splitting into small chunks — each
 * retryable on its own — fixes that without touching video quality at all.
 *
 * Client sends chunks 0..total-1 for the same `uploadId`, in order. Each is
 * appended to a scratch file; the final chunk also carries filename/mime and
 * triggers the same local-write + background-ingest flow as the plain upload
 * route (brief §8.2 — never blocks on the worker).
 */
export async function POST(req: NextRequest) {
  bootstrap();
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "bad form" }, { status: 400 });

  const uploadId = String(form.get("uploadId") ?? "");
  const index = Number(form.get("index"));
  const total = Number(form.get("total"));
  const chunk = form.get("chunk");

  if (!ID_RE.test(uploadId) || !Number.isInteger(index) || !Number.isInteger(total) || total < 1 || index < 0 || index >= total) {
    return NextResponse.json({ error: "bad chunk metadata" }, { status: 400 });
  }
  if (!(chunk instanceof File)) {
    return NextResponse.json({ error: "no chunk" }, { status: 400 });
  }

  const storage = getStorage();
  const tmpRel = `tmp/uploads/${uploadId}.part`;
  const tmpFull = storage.resolveLocal(tmpRel);
  await fs.mkdir(path.dirname(tmpFull), { recursive: true });
  const buf = Buffer.from(await chunk.arrayBuffer());

  // first chunk: start fresh (in case of a retried/abandoned earlier attempt)
  if (index === 0) await fs.rm(tmpFull, { force: true });
  await fs.appendFile(tmpFull, buf);

  const stat = await fs.stat(tmpFull).catch(() => null);
  if (stat && stat.size > MAX_BYTES) {
    await fs.rm(tmpFull, { force: true });
    return NextResponse.json({ error: "file too large (max 500 MB)" }, { status: 413 });
  }

  if (index < total - 1) {
    return NextResponse.json({ ok: true, received: index, of: total });
  }

  // final chunk — finalize into place and kick off background ingest
  const filename = String(form.get("filename") ?? "upload.mp4");
  const mime = String(form.get("mime") ?? "video/mp4");
  const safe = filename.replace(/[^\w.\- ]+/g, "_");
  const finalRel = `raw/${Date.now()}_${safe}`;
  const finalFull = storage.resolveLocal(finalRel);
  await fs.mkdir(path.dirname(finalFull), { recursive: true });
  await fs.rename(tmpFull, finalFull);
  const finalStat = await fs.stat(finalFull);

  const video = addVideo({
    filename,
    path: finalRel,
    bytes: finalStat.size,
    mime,
    qualityScore: null,
    qualityStatus: "PENDING",
    meta: {},
  });
  enqueueIngest(video.id, { filename, bytes: finalStat.size, mime, localPath: finalRel });

  return NextResponse.json({ video }, { status: 201 });
}
