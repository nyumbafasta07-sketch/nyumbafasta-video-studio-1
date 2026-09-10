/**
 * MOCK VoiceProvider. Delegates generation to the GPUProvider seam so that seam
 * is exercised and tested in Phase 2 (brief §2.3). Writes a WAV into the
 * project's audio/ folder.
 */
import { getStorage, projectPaths } from "../../storage";
import { getGpu } from "../gpu";
import type { VoiceProvider, VoiceResult } from "../types";

export class MockVoiceProvider implements VoiceProvider {
  readonly name = "mock";

  async synthesize(input: {
    projectId: string;
    text: string;
    voiceId: string;
    emotion: string;
    outDir: string;
  }): Promise<VoiceResult> {
    const gpu = getGpu();
    const artifact = await gpu.execute({
      type: "voice",
      projectId: input.projectId,
      jobId: "",
      payload: { text: input.text, voiceId: input.voiceId, emotion: input.emotion },
    });

    const storage = getStorage();
    const rel = `${projectPaths(input.projectId).audio}/voice.wav`;
    const stored = await storage.put({ path: rel, data: artifact.data, mime: artifact.mime });
    const seconds = Number(artifact.meta.seconds ?? 0);

    return {
      kind: artifact.kind,
      provider: this.name,
      model: artifact.model,
      path: stored.path,
      durationSeconds: seconds,
      sampleRate: 22050,
      meta: { ...artifact.meta, bytes: stored.bytes, via: gpu.name },
    };
  }
}
