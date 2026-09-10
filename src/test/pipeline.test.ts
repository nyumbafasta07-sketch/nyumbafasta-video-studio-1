import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { freshEnv, type TestEnv } from "./helpers";
import { createJob, createProject, getOutputAssetForJob, listAssetsForProject } from "@/lib/repo";
import { processJob } from "@/lib/pipeline/orchestrator";
import { getStorage, projectPaths } from "@/lib/storage";

let env: TestEnv;
beforeEach(() => {
  env = freshEnv();
});
afterEach(() => env.cleanup());

const inputs = {
  voiceId: "voice_x",
  emotion: "Neutral",
  avatarId: "avatar_x",
  background: "#00b140",
  width: 640, // smaller than 1080x1920 to keep the test fast
  height: 1136,
};

describe("end-to-end mock pipeline", () => {
  it("script in -> mock voice -> mock avatar -> mock lip-sync -> green screen -> MP4 out", async () => {
    const project = createProject(
      "Mtihani wa Pipeline",
      "Habari za asubuhi. Karibu NyumbaFasta. Leo tutaangalia namna ya kutumia app.",
    );
    const job = createJob(project.id, inputs);

    const done = await processJob(job.id);
    expect(done.state).toBe("COMPLETED");
    expect(done.error).toBeNull();

    // every stage recorded done
    for (const key of [
      "validate_script",
      "generate_audio",
      "generate_face",
      "lip_sync",
      "render_video",
      "validate_output",
    ]) {
      expect(done.progress[key]?.status).toBe("done");
    }

    // artifacts on disk
    const s = getStorage();
    const paths = projectPaths(project.id);
    expect(await s.exists(`${paths.script}/normalized.txt`)).toBe(true);
    expect(await s.exists(`${paths.audio}/voice.wav`)).toBe(true);
    expect(await s.exists(`${paths.avatar}/face.png`)).toBe(true);
    expect(await s.exists(`${paths.lipsync}/talking.mp4`)).toBe(true);
    expect(await s.exists(`${paths.output}/final.mp4`)).toBe(true);

    // output asset row + a real, non-trivial MP4
    const out = getOutputAssetForJob(job.id)!;
    expect(out.kind).toBe("output");
    expect(out.bytes).toBeGreaterThan(2048);
    expect(out.meta.width).toBe(inputs.width);
    expect(out.meta.height).toBe(inputs.height);

    const mp4 = await s.get(out.path);
    // ISO-BMFF: bytes 4..8 are "ftyp"
    expect(mp4.subarray(4, 8).toString()).toBe("ftyp");

    // intermediate assets listed for the Assets page
    const kinds = new Set(listAssetsForProject(project.id).map((a) => a.kind));
    expect(kinds).toContain("audio");
    expect(kinds).toContain("avatar");
    expect(kinds).toContain("lipsync");
    expect(kinds).toContain("output");
  });

  it("fails cleanly when the script is empty (no crash, job FAILED)", async () => {
    const project = createProject("Tupu", "   ");
    const job = createJob(project.id, inputs);
    const done = await processJob(job.id);
    expect(done.state).toBe("FAILED");
    expect(done.stage).toBe("validate_script");
    expect(done.error).toBeTruthy();
  });

  it("is resumable: a second run reuses existing stage artifacts", async () => {
    const project = createProject("Rudia", "Sentensi ya kwanza. Sentensi ya pili.");
    const job = createJob(project.id, inputs);
    await processJob(job.id);
    const second = await processJob(job.id);
    expect(second.state).toBe("COMPLETED");
  });
});
