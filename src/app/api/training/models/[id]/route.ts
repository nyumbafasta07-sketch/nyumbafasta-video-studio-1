import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { bootstrap } from "@/lib/bootstrap";
import {
  getVersion,
  listEvalRuns,
  setVersionNotes,
  setVersionStatus,
} from "@/lib/training/repo";
import { STATUS_TRANSITIONS, type ModelStatus } from "@/lib/training/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  bootstrap();
  const version = getVersion(params.id);
  if (!version) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({
    version,
    evalRuns: listEvalRuns(version.id).map((e) => ({
      ...e,
      previewUrl: e.output_path
        ? `/api/training/assets/${e.output_path.replace(/^training\//, "")}`
        : null,
    })),
    allowedTransitions: STATUS_TRANSITIONS[version.status],
  });
}

const Body = z.object({
  status: z.enum(["experimental", "approved", "production", "rejected", "archived"]).optional(),
  notes: z.string().max(2000).optional(),
});

/** Transition status (§8.5 — the founder is the human approver) and/or set notes. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  bootstrap();
  const version = getVersion(params.id);
  if (!version) return NextResponse.json({ error: "not found" }, { status: 404 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "bad body" }, { status: 400 });

  if (parsed.data.notes !== undefined) setVersionNotes(version.id, parsed.data.notes);

  if (parsed.data.status) {
    const next = parsed.data.status as ModelStatus;
    if (!STATUS_TRANSITIONS[version.status].includes(next)) {
      return NextResponse.json(
        { error: `cannot go ${version.status} → ${next}` },
        { status: 409 },
      );
    }
    setVersionStatus(version.id, next);
  }
  return NextResponse.json({ version: getVersion(version.id) });
}
