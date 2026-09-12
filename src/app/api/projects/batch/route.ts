import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { bootstrap } from "@/lib/bootstrap";
import { config } from "@/lib/config";
import { createProject, createJob, listVoices, listAvatars } from "@/lib/repo";
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
  scripts: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        scriptText: z.string().min(1).max(20000),
      }),
    )
    .min(1)
    .max(50),
  voiceId: z.string().min(1).optional(),
  avatarId: z.string().min(1).optional(),
  emotion: z.enum(EMOTIONS).optional().default("Neutral"),
  background: z.string().regex(/^#?[0-9a-fA-F]{6}$/).optional(),
});

/**
 * Create + queue many videos from one sitting instead of one at a time.
 * Every job lands in the SAME serialized queue as a normal single-video
 * job (see pipeline/runner.ts) — they run strictly one after another, never
 * concurrently, so this is safe against a real GPU worker (a real worker's
 * VRAM can't take two generation jobs fighting over it at once). The point:
 * connect a GPU once, queue up a batch, and it works through all of them
 * unattended instead of needing the founder to babysit each one.
 */
export async function POST(req: NextRequest) {
  bootstrap();
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { scripts, emotion } = parsed.data;

  const voiceId = parsed.data.voiceId ?? listVoices().find((v) => v.is_default)?.id ?? listVoices()[0]?.id;
  const avatarId =
    parsed.data.avatarId ?? listAvatars().find((a) => a.is_default)?.id ?? listAvatars()[0]?.id;
  if (!voiceId || !avatarId) {
    return NextResponse.json({ error: "no voice/avatar available" }, { status: 400 });
  }
  const background = (parsed.data.background ?? config.output.greenHex).replace(/^#?/, "#");

  const created = scripts.map(({ name, scriptText }) => {
    const project = createProject(name.trim(), scriptText);
    const job = createJob(project.id, {
      voiceId,
      avatarId,
      emotion,
      background,
      width: config.output.width,
      height: config.output.height,
    });
    enqueue(job.id);
    return { projectId: project.id, jobId: job.id, name: project.name };
  });

  return NextResponse.json({ created }, { status: 201 });
}
