import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { bootstrap } from "@/lib/bootstrap";
import { getStorage } from "@/lib/storage";
import { deleteVideo, getVideo, setVideoInDataset } from "@/lib/training/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Patch = z.object({ inDataset: z.boolean() });

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  bootstrap();
  const v = getVideo(params.id);
  if (!v) return NextResponse.json({ error: "not found" }, { status: 404 });
  const parsed = Patch.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "bad body" }, { status: 400 });
  setVideoInDataset(v.id, parsed.data.inDataset);
  return NextResponse.json({ video: getVideo(v.id) });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  bootstrap();
  const v = getVideo(params.id);
  if (!v) return NextResponse.json({ error: "not found" }, { status: 404 });
  deleteVideo(v.id);
  await getStorage().remove(v.path);
  return NextResponse.json({ ok: true });
}
