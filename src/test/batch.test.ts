import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { freshEnv, type TestEnv } from "./helpers";

// unit-test the route's own logic; runner-queue serialization is covered
// separately (and for real, unmocked) in pipeline.test.ts
const enqueueMock = vi.fn();
vi.mock("@/lib/pipeline/runner", () => ({ enqueue: (...a: unknown[]) => enqueueMock(...a) }));
import { POST as batchCreate } from "@/app/api/projects/batch/route";
import { listJobsForProject, listProjects } from "@/lib/repo";

let env: TestEnv;
beforeEach(() => {
  env = freshEnv();
  enqueueMock.mockClear();
});
afterEach(() => env.cleanup());

function req(body: unknown) {
  return new NextRequest(new URL("http://localhost/api/projects/batch"), {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/projects/batch", () => {
  it("creates one project + one queued job per script, in order", async () => {
    const res = await batchCreate(
      req({
        scripts: [
          { name: "Tangazo 1", scriptText: "Habari za asubuhi." },
          { name: "Tangazo 2", scriptText: "Karibu NyumbaFasta." },
        ],
      }),
    );
    expect(res.status).toBe(201);
    const { created } = await res.json();
    expect(created).toHaveLength(2);
    expect(created[0].name).toBe("Tangazo 1");
    expect(created[1].name).toBe("Tangazo 2");

    expect(listProjects()).toHaveLength(2);
    for (const c of created) {
      expect(listJobsForProject(c.projectId)).toHaveLength(1);
    }
    // every job handed to the (serialized) queue, one enqueue call per job
    expect(enqueueMock).toHaveBeenCalledTimes(2);
  });

  it("rejects an empty batch", async () => {
    const res = await batchCreate(req({ scripts: [] }));
    expect(res.status).toBe(400);
    expect(listProjects()).toHaveLength(0);
  });

  it("rejects a script with no text", async () => {
    const res = await batchCreate(req({ scripts: [{ name: "X", scriptText: "" }] }));
    expect(res.status).toBe(400);
  });

  it("shares the same voice/avatar/emotion across every video in the batch", async () => {
    const res = await batchCreate(
      req({
        scripts: [
          { name: "A", scriptText: "Kwanza." },
          { name: "B", scriptText: "Pili." },
        ],
        voiceId: "voice_x",
        avatarId: "avatar_x",
        emotion: "Excited",
      }),
    );
    const { created } = await res.json();
    for (const c of created) {
      const [job] = listJobsForProject(c.projectId);
      expect(job.inputs.voiceId).toBe("voice_x");
      expect(job.inputs.avatarId).toBe("avatar_x");
      expect(job.inputs.emotion).toBe("Excited");
    }
  });
});
