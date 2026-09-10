import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { bootstrap } from "@/lib/bootstrap";
import { config } from "@/lib/config";
import { createJob, getProject, listVoices, listAvatars } from "@/lib/repo";
import { enqueue } from "@/lib/pipeline/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMOTIONS = [
  "Neutral",
  "Friendly",
  "Excited",
  "Serious",
  "Professional",
  "Storytelling",
] as const;

const Body = z.object({
  projectId: z.string().min(1),
  voiceId: z.string().min(1).optional(),
  avatarId: z.string().min(1).optional(),
  emotion: z.enum(EMOTIONS).optional().default("Neutral"),
  background: z.string().regex(/^#?[0-9a-fA-F]{6}$/).optional(),
});

export async function POST(req: NextRequest) {
  bootstrap();
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { projectId, emotion } = parsed.data;

  const project = getProject(projectId);
  if (!project) return NextResponse.json({ error: "project not found" }, { status: 404 });
  if (!project.script_text.trim()) {
    return NextResponse.json({ error: "project has no script" }, { status: 400 });
  }

  const voiceId = parsed.data.voiceId ?? listVoices().find((v) => v.is_default)?.id ?? listVoices()[0]?.id;
  const avatarId =
    parsed.data.avatarId ?? listAvatars().find((a) => a.is_default)?.id ?? listAvatars()[0]?.id;
  if (!voiceId || !avatarId) {
    return NextResponse.json({ error: "no voice/avatar available" }, { status: 400 });
  }

  const background = (parsed.data.background ?? config.output.greenHex).replace(/^#?/, "#");

  const job = createJob(projectId, {
    voiceId,
    avatarId,
    emotion,
    background,
    width: config.output.width,
    height: config.output.height,
  });

  enqueue(job.id);
  return NextResponse.json({ job }, { status: 201 });
}
