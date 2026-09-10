import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { freshEnv, type TestEnv } from "./helpers";
import {
  createJob,
  createProject,
  getJob,
  listJobsByStates,
  listJobsForProject,
  updateJob,
  NON_TERMINAL_STATES,
} from "@/lib/repo";

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
  width: 1080,
  height: 1920,
};

describe("jobs repo", () => {
  it("creates a QUEUED job with parsed inputs", () => {
    const p = createProject("P", "Neno moja.");
    const j = createJob(p.id, inputs);
    expect(j.id).toMatch(/^job_/);
    expect(j.state).toBe("QUEUED");
    expect(j.inputs.width).toBe(1080);
    expect(listJobsForProject(p.id)).toHaveLength(1);
  });

  it("updates state and progress and lists by state", () => {
    const p = createProject("P", "Neno.");
    const j = createJob(p.id, inputs);
    updateJob(j.id, {
      state: "RENDERING",
      stage: "render_video",
      progress: { render_video: { status: "running", attempt: 1 } },
    });
    const got = getJob(j.id)!;
    expect(got.state).toBe("RENDERING");
    expect(got.progress.render_video.status).toBe("running");
    expect(listJobsByStates(["RENDERING"]).map((x) => x.id)).toContain(j.id);
    expect(listJobsByStates(NON_TERMINAL_STATES).map((x) => x.id)).toContain(j.id);
    expect(listJobsByStates(["COMPLETED"])).toHaveLength(0);
  });
});
