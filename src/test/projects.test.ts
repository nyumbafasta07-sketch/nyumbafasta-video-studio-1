import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { freshEnv, type TestEnv } from "./helpers";
import {
  createProject,
  getProject,
  listProjects,
  updateProjectScript,
  listVoices,
  listAvatars,
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
