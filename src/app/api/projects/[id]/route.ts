import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { bootstrap } from "@/lib/bootstrap";
import {
  getProject,
  listAssetsForProject,
  listJobsForProject,
  updateProjectScript,
} from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  bootstrap();
  const project = getProject(params.id);
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({
    project,
    jobs: listJobsForProject(project.id),
    assets: listAssetsForProject(project.id),
  });
}

const PatchBody = z.object({ scriptText: z.string().max(20000) });

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  bootstrap();
  const project = getProject(params.id);
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });
  const parsed = PatchBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  updateProjectScript(project.id, parsed.data.scriptText);
  return NextResponse.json({ project: getProject(project.id) });
}
