/**
 * VideoRenderer using ffmpeg-static. Composites the (background-free) talking
 * clip onto a solid green screen at the target 9:16 resolution and muxes the
 * voice track. This interface is stable; Phase 6 swaps in a higher-quality
 * render behind it.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getStorage, projectPaths } from "../../storage";
import { runFfmpeg, probe } from "../ffmpeg";
import type { VideoRenderer, RenderResult } from "../types";

function hexToFf(hex: string): string {
  return "0x" + hex.replace(/^#/, "").toUpperCase();
}

export class FfmpegRenderer implements VideoRenderer {
  readonly name = "ffmpeg";

  async render(input: {
    projectId: string;
    lipSyncPath: string;
    audioPath: string;
    backgroundHex: string;
    width: number;
    height: number;
    outDir: string;
    captionText?: string;
  }): Promise<RenderResult> {
    const storage = getStorage();
    const clipLocal = storage.resolveLocal(input.lipSyncPath);
    const audioLocal = storage.resolveLocal(input.audioPath);

    const tmpDir = path.join(os.tmpdir(), "vs-render");
    await fs.mkdir(tmpDir, { recursive: true });
    const outLocal = path.join(tmpDir, `${randomUUID()}.mp4`);

    const bg = hexToFf(input.backgroundHex);
    const { width: W, height: H } = input;

    // green background <- scaled talking clip centred, optional caption strip
    const filters = [
      `color=c=${bg}:s=${W}x${H}:r=25[bg]`,
      `[0:v]scale=${Math.round(W * 0.92)}:-2[fg]`,
      `[bg][fg]overlay=(W-w)/2:(H-h)/2:shortest=1[v0]`,
    ];
    let lastLabel = "v0";
    if (input.captionText && input.captionText.trim()) {
      const safe = input.captionText
        .replace(/\\/g, "\\\\")
        .replace(/:/g, "\\:")
        .replace(/'/g, "’")
        .slice(0, 120);
      filters.push(
        `[v0]drawtext=text='${safe}':fontcolor=white:fontsize=${Math.round(
          W / 24,
        )}:box=1:boxcolor=black@0.5:boxborderw=12:x=(w-text_w)/2:y=h-(h/8)[v1]`,
      );
      lastLabel = "v1";
    }

    await runFfmpeg([
      "-i", clipLocal,
      "-i", audioLocal,
      "-filter_complex", filters.join(";"),
      "-map", `[${lastLabel}]`,
      "-map", "1:a:0",
      "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "160k",
      "-shortest",
      "-movflags", "+faststart",
      outLocal,
    ]);

    const info = await probe(outLocal);
    const data = await fs.readFile(outLocal);
    await fs.rm(outLocal, { force: true });

    const rel = `${projectPaths(input.projectId).output}/final.mp4`;
    const stored = await storage.put({ path: rel, data, mime: "video/mp4" });

    return {
      kind: "MOCK", // real pixels, but composed from mock inputs — never blur (brief §0)
      provider: this.name,
      model: "ffmpeg-static/libx264",
      path: stored.path,
      durationSeconds: info.durationSeconds,
      width: info.width || W,
      height: info.height || H,
      hasAudio: info.hasAudio,
      meta: { bytes: stored.bytes, background: input.backgroundHex },
    };
  }
}
