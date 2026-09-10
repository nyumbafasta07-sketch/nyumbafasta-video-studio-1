import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { freshEnv, type TestEnv } from "./helpers";
import {
  getScriptProvider,
  getVoiceProvider,
  getFaceProvider,
  getRenderer,
} from "@/lib/providers";
import { getGpu } from "@/lib/providers/gpu";
import { getStorage, projectPaths } from "@/lib/storage";

let env: TestEnv;
beforeEach(() => {
  env = freshEnv();
});
afterEach(() => env.cleanup());

describe("provider interfaces (mock impls)", () => {
  it("ScriptProvider.analyze normalises, segments, warns on empty", async () => {
    const sp = getScriptProvider();
    const ok = await sp.analyze({ text: "Habari.  Karibu   sana.\n\nTwende." });
    expect(ok.kind).toBe("MOCK");
    expect(ok.normalizedText).toBe("Habari. Karibu sana.\n\nTwende.");
    expect(ok.segments.length).toBe(3);
    expect(ok.totalEstSeconds).toBeGreaterThan(0);

    const empty = await sp.analyze({ text: "   " });
    expect(empty.warnings).toContain("Script is empty.");
  });

  it("GPUProvider local-mock reports available and produces MOCK artifacts", async () => {
    const gpu = getGpu();
    expect(gpu.name).toBe("local-mock");
    expect(await gpu.available()).toBe(true);

    const voice = await gpu.execute({
      type: "voice",
      projectId: "proj_x",
      jobId: "",
      payload: { text: "moja mbili tatu nne", emotion: "Neutral" },
    });
    expect(voice.kind).toBe("MOCK");
    expect(voice.mime).toBe("audio/wav");
    expect(voice.data.subarray(0, 4).toString()).toBe("RIFF");

    const face = await gpu.execute({
      type: "face",
      projectId: "proj_x",
      jobId: "",
      payload: { width: 240, height: 300 },
    });
    expect(face.mime).toBe("image/png");
    expect(face.data.subarray(1, 4).toString()).toBe("PNG");
  });

  it("VoiceProvider writes a wav into the project's audio folder", async () => {
    const res = await getVoiceProvider().synthesize({
      projectId: "proj_v",
      text: "Neno moja mbili tatu",
      voiceId: "voice_x",
      emotion: "Neutral",
      outDir: projectPaths("proj_v").audio,
    });
    expect(res.kind).toBe("MOCK");
    expect(res.path).toBe(`${projectPaths("proj_v").audio}/voice.wav`);
    expect(await getStorage().exists(res.path)).toBe(true);
    expect(res.meta.via).toBe("local-mock");
  });

  it("FaceProvider writes a png into the project's avatar folder", async () => {
    const res = await getFaceProvider().render({
      projectId: "proj_f",
      avatarId: "avatar_x",
      width: 1080,
      height: 1920,
      outDir: projectPaths("proj_f").avatar,
    });
    expect(res.path).toBe(`${projectPaths("proj_f").avatar}/face.png`);
    expect(await getStorage().exists(res.path)).toBe(true);
  });

  it("registry resolves each interface to its mock/tool impl", () => {
    expect(getScriptProvider().name).toBe("mock");
    expect(getVoiceProvider().name).toBe("mock");
    expect(getFaceProvider().name).toBe("mock");
    expect(getRenderer().name).toBe("ffmpeg");
  });
});
