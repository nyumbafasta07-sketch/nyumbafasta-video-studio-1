/**
 * Thin wrapper around the ffmpeg-static binary. Used by the lip-sync mock and
 * the video renderer. ffmpeg-static ships ffmpeg only (no ffprobe), so probing
 * scrapes ffmpeg's stderr.
 */
import { spawn } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";

export const FFMPEG_PATH: string = (ffmpegStatic as unknown as string) || "ffmpeg";

export function runFfmpeg(args: string[]): Promise<{ stderr: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG_PATH, ["-hide_banner", "-y", ...args], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    p.stderr.on("data", (d) => (stderr += d.toString()));
    p.on("error", reject);
    p.on("close", (code) => {
      if (code === 0) resolve({ stderr });
      else reject(new Error(`ffmpeg exited ${code}\n${stderr.slice(-4000)}`));
    });
  });
}

export interface ProbeResult {
  durationSeconds: number;
  width: number;
  height: number;
  hasAudio: boolean;
}

/** Probe by asking ffmpeg to read the file and dump stream info to stderr. */
export async function probe(file: string): Promise<ProbeResult> {
  let stderr = "";
  try {
    ({ stderr } = await runFfmpeg(["-i", file, "-f", "null", "-"]));
  } catch (e) {
    stderr = (e as Error).message;
  }

  const dur = /Duration:\s*(\d+):(\d+):(\d+\.\d+)/.exec(stderr);
  const durationSeconds = dur
    ? Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3])
    : 0;
  const res = /,\s*(\d{2,5})x(\d{2,5})/.exec(stderr);
  const width = res ? Number(res[1]) : 0;
  const height = res ? Number(res[2]) : 0;
  const hasAudio = /Stream #\d+:\d+.*: Audio:/.test(stderr);
  return { durationSeconds, width, height, hasAudio };
}
