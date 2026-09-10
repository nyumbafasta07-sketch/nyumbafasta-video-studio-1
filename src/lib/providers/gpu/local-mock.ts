/**
 * In-process MOCK GPU provider (brief §2.4). Produces deliberately fake voice,
 * face, and lip-sync artifacts with zero GPU. Mirrors worker/worker.py so the
 * `http` provider is a drop-in swap later.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { makeMockWav, makeMockFacePng } from "../media";
import { runFfmpeg } from "../ffmpeg";
import type { GpuArtifact, GpuProvider, GpuTask } from "./types";

async function tmp(ext: string): Promise<string> {
  const dir = path.join(os.tmpdir(), "vs-mock");
  await fs.mkdir(dir, { recursive: true });
  return path.join(dir, `${randomUUID()}.${ext}`);
}

export class LocalMockGpu implements GpuProvider {
  readonly name = "local-mock";

  async available(): Promise<boolean> {
    return true;
  }

  async execute(task: GpuTask): Promise<GpuArtifact> {
    switch (task.type) {
      case "voice":
        return this.voice(task);
      case "face":
        return this.face(task);
      case "lipsync":
        return this.lipsync(task);
      default:
        throw new Error(`unknown gpu task: ${(task as GpuTask).type}`);
    }
  }

  private async voice(task: GpuTask): Promise<GpuArtifact> {
    const text = String(task.payload.text ?? "");
    const wordCount = Math.max(1, text.trim().split(/\s+/).filter(Boolean).length);
    const seconds =
      typeof task.payload.seconds === "number"
        ? (task.payload.seconds as number)
        : Math.max(1, wordCount / 2.3);
    const wav = makeMockWav({ seconds, wordCount });
    return {
      data: wav,
      mime: "audio/wav",
      kind: "MOCK",
      model: "mock-tone-v1",
      meta: { seconds, wordCount, emotion: task.payload.emotion ?? "neutral" },
    };
  }

  private async face(task: GpuTask): Promise<GpuArtifact> {
    const width = Number(task.payload.width ?? 720);
    const height = Number(task.payload.height ?? 900);
    const png = makeMockFacePng({ width, height });
    return {
      data: png,
      mime: "image/png",
      kind: "MOCK",
      model: "mock-portrait-v1",
      meta: { width, height, avatarId: task.payload.avatarId },
    };
  }

  private async lipsync(task: GpuTask): Promise<GpuArtifact> {
    const facePath = String(task.payload.facePath);
    const audioPath = String(task.payload.audioPath);
    const width = Number(task.payload.width ?? 720);
    const height = Number(task.payload.height ?? 900);
    const out = await tmp("mp4");

    // Still face, looped for the audio's length, with an oscillating "mouth" bar
    // (fake lip movement) and a slow vertical bob (fake breathing).
    const mouthW = Math.round(width * 0.24);
    const mouthH = Math.round(height * 0.09);
    const mouthX = Math.round(width / 2 - mouthW / 2);
    const mouthY = Math.round(height * 0.72);
    const vf = [
      `scale=${width}:${height}`,
      `drawbox=x=${mouthX}:y=${mouthY}:w=${mouthW}:h='${mouthH}*abs(sin(2*PI*t*3))':color=black@0.85:t=fill`,
      `crop=${width}:${height}:0:'2*sin(2*PI*t*0.25)'`,
      `format=yuv420p`,
    ].join(",");

    await runFfmpeg([
      "-loop", "1", "-i", facePath,
      "-i", audioPath,
      "-shortest",
      "-vf", vf,
      "-r", "25",
      "-c:v", "libx264", "-preset", "ultrafast", "-tune", "stillimage",
      "-c:a", "aac", "-b:a", "128k",
      "-pix_fmt", "yuv420p",
      out,
    ]);

    const data = await fs.readFile(out);
    await fs.rm(out, { force: true });
    return {
      data,
      mime: "video/mp4",
      kind: "MOCK",
      model: "mock-lipbar-v1",
      meta: { width, height },
    };
  }
}
