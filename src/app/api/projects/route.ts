import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { bootstrap } from "@/lib/bootstrap";
import { createProject, listProjects } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  bootstrap();
  return NextResponse.json({ projects: listProjects() });
}

const CreateBody = z.object({
  name: z.string().min(1).max(200),
  scriptText: z.string().max(20000).optional().default(""),
});

export async function POST(req: NextRequest) {
  bootstrap();
  const parsed = CreateBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const project = createProject(parsed.data.name.trim(), parsed.data.scriptText);
  return NextResponse.json({ project }, { status: 201 });
}
