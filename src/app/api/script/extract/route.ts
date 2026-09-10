import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024;

/** Extract plain text from an uploaded .txt / .md / .docx for the Script step (§5). */
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "file too large (max 5 MB)" }, { status: 413 });
  }

  const name = file.name.toLowerCase();
  const buf = Buffer.from(await file.arrayBuffer());

  try {
    if (name.endsWith(".txt") || name.endsWith(".md")) {
      return NextResponse.json({ text: buf.toString("utf8") });
    }
    if (name.endsWith(".docx")) {
      const mammoth = (await import("mammoth")).default;
      const { value } = await mammoth.extractRawText({ buffer: buf });
      return NextResponse.json({ text: value });
    }
    return NextResponse.json(
      { error: "unsupported type — use .txt, .md or .docx" },
      { status: 415 },
    );
  } catch (e) {
    return NextResponse.json(
      { error: `could not read file: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 422 },
    );
  }
}
