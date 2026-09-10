/**
 * MOCK LipSyncProvider. Delegates to the GPUProvider seam (which runs ffmpeg to
 * make a fake talking clip), writes the clip into the project's lip-sync/ folder.
 * Real Swahili-phoneme-validated lip-sync is Phase 5.
 */
import { getStorage, projectPaths } from "../../storage";
import { getGpu } from "../gpu";
import type { LipSyncProvider, LipSyncResult } from "../types";

export class MockLipSyncProvider implements LipSyncProvider {
  readonly name = "mock";

  async sync(input: {
    projectId: string;
    facePath: string;
    audioPath: string;
    width: number;
    height: number;
    outDir: string;
  }): Promise<LipSyncResult> {
    const storage = getStorage();
    const faceLocal = storage.resolveLocal(input.facePath);
    const audioLocal = storage.resolveLocal(input.audioPath);

    const clipW = Math.round(input.width * 0.7);
    const clipH = Math.round(input.height * 0.55);

    const gpu = getGpu();
    const artifact = await gpu.execute({
      type: "lipsync",
      projectId: input.projectId,
      jobId: "",
      payload: {
        facePath: faceLocal,
        audioPath: audioLocal,
        width: clipW,
        height: clipH,
      },
    });

    const rel = `${projectPaths(input.projectId).lipsync}/talking.mp4`;
    const stored = await storage.put({ path: rel, data: artifact.data, mime: artifact.mime });

    return {
      kind: artifact.kind,
      provider: this.name,
      model: artifact.model,
      path: stored.path,
      durationSeconds: 0, // renderer probes the true duration
      width: clipW,
      height: clipH,
      meta: { ...artifact.meta, bytes: stored.bytes, via: gpu.name },
    };
  }
}
