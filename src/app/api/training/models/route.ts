import { NextRequest, NextResponse } from "next/server";
import { bootstrap } from "@/lib/bootstrap";
import { listVersions } from "@/lib/training/repo";
import type { Profile } from "@/lib/training/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  bootstrap();
  const profile = req.nextUrl.searchParams.get("profile") as Profile | null;
  return NextResponse.json({ versions: listVersions(profile ?? undefined) });
}
