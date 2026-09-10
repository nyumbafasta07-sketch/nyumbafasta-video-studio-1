import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { freshEnv, type TestEnv } from "./helpers";
import {
  createProject,
  getProject,
  listProjects,
  updateProjectScript,
  listVoices,
  listAvatars,
  createJob,
  deleteProject,
  listJobsForProject,
  listRecentJobs,
} from "@/lib/repo";

let env: TestEnv;
beforeEach(() => {
  env = freshEnv();
});
afterEach(() => env.cleanup());

describe("projects repo", () => {
  it("creates and reads a project", () => {
    const p = createProject("Tangazo la NyumbaFasta", "Habari zenu wote.");
    expect(p.id).toMatch(/^proj_/);
    expect(getProject(p.id)?.name).toBe("Tangazo la NyumbaFasta");
    expect(listProjects()).toHaveLength(1);
  });

  it("updates the script", () => {
    const p = createProject("X");
    updateProjectScript(p.id, "Karibu tena.");
    expect(getProject(p.id)?.script_text).toBe("Karibu tena.");
  });

  it("deleteProject cascades to its jobs", () => {
    const p = createProject("Doomed", "Neno.");
    createJob(p.id, {
      voiceId: "v", emotion: "Neutral", avatarId: "a",
      background: "#00b140", width: 320, height: 568,
    });
    expect(listJobsForProject(p.id)).toHaveLength(1);
    deleteProject(p.id);
    expect(getProject(p.id)).toBeNull();
    expect(listJobsForProject(p.id)).toHaveLength(0);
    expect(listRecentJobs(10)).toHaveLength(0);
  });

  it("seeds one default mock voice and avatar", () => {
    const v = listVoices();
    const a = listAvatars();
    expect(v).toHaveLength(1);
    expect(a).toHaveLength(1);
    expect(v[0].status).toBe("mock");
    expect(v[0].is_default).toBe(1);
    expect(a[0].status).toBe("mock");
  });
});
