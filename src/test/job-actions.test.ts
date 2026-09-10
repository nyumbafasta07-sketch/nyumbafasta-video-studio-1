import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { freshEnv, type TestEnv } from "./helpers";

// don't kick real pipeline work from the retry route in this unit test
vi.mock("@/lib/pipeline/runner", () => ({ enqueue: vi.fn(), sweep: vi.fn() }));
import { createJob, createProject, getJob, updateJob } from "@/lib/repo";
import { POST as cancel } from "@/app/api/jobs/[id]/cancel/route";
import { POST as retry } from "@/app/api/jobs/[id]/retry/route";

let env: TestEnv;
beforeEach(() => {
  env = freshEnv();
});
afterEach(() => env.cleanup());

const inputs = {
  voiceId: "v",
  emotion: "Neutral",
  avatarId: "a",
  background: "#00b140",
  width: 320,
  height: 568,
};

function req(id: string) {
  return new NextRequest(new URL(`http://localhost/api/jobs/${id}/x`), { method: "POST" });
}

describe("cancel + retry routes", () => {
  it("cancels a non-terminal job", async () => {
    const p = createProject("P", "Neno.");
    const j = createJob(p.id, inputs);
    const res = await cancel(req(j.id), { params: { id: j.id } });
    expect(res.status).toBe(200);
    expect(getJob(j.id)!.state).toBe("CANCELLED");
  });

  it("refuses to cancel a completed job", async () => {
    const p = createProject("P", "Neno.");
    const j = createJob(p.id, inputs);
    updateJob(j.id, { state: "COMPLETED" });
    const res = await cancel(req(j.id), { params: { id: j.id } });
    expect(res.status).toBe(409);
  });

  it("retries a FAILED job: re-queues and clears the failed stage", async () => {
    const p = createProject("P", "Neno.");
    const j = createJob(p.id, inputs);
    updateJob(j.id, {
      state: "FAILED",
      stage: "generate_audio",
      error: "boom",
      progress: { validate_script: { status: "done", attempt: 1 }, generate_audio: { status: "error", attempt: 3 } },
    });
    const res = await retry(req(j.id), { params: { id: j.id } });
    expect(res.status).toBe(200);
    const after = getJob(j.id)!;
    expect(after.state).toBe("QUEUED");
    expect(after.error).toBeNull();
    expect(after.progress.validate_script.status).toBe("done"); // kept
    expect(after.progress.generate_audio).toBeUndefined(); // cleared
  });

  it("refuses to retry a job that is still running", async () => {
    const p = createProject("P", "Neno.");
    const j = createJob(p.id, inputs);
    updateJob(j.id, { state: "RENDERING" });
    const res = await retry(req(j.id), { params: { id: j.id } });
    expect(res.status).toBe(409);
  });
});
