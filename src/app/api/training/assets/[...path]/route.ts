import { NextRequest, NextResponse } from "next/server";
import { bootstrap } from "@/lib/bootstrap";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIME: Record<string, string> = {
  wav: "audio/wav",
  mp3: "audio/mpeg",
  png: "image/png",
  jpg: "image/jpeg",
  mp4: "video/mp4",
};

/** Auth-gated preview of a training eval asset. Confined to the training/ prefix;
 * raw recordings and model files are never served here (SECURITY.md, §8.7). */
export async function GET(_req: NextRequest, { params }: { params: { path: string[] } }) {
  bootstrap();
  const rel = `training/${(params.path ?? []).join("/")}`;
  if (rel.includes("..")) return NextResponse.json({ error: "bad path" }, { status: 400 });
  const storage = getStorage();
  if (!(await storage.exists(rel))) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const buf = await storage.get(rel);
  const ext = rel.split(".").pop() ?? "";
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "content-type": MIME[ext] ?? "application/octet-stream",
      "cache-control": "private, no-store",
    },
  });
}
