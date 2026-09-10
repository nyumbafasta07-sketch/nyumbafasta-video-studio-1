import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { freshEnv, type TestEnv } from "./helpers";
import { getStorage, projectPaths } from "@/lib/storage";

let env: TestEnv;
beforeEach(() => {
  env = freshEnv();
});
afterEach(() => env.cleanup());

describe("LocalStorage", () => {
  it("put/get/exists round-trips", async () => {
    const s = getStorage();
    const rel = `${projectPaths("proj_x").audio}/voice.wav`;
    const stored = await s.put({ path: rel, data: Buffer.from("hello"), mime: "audio/wav" });
    expect(stored.bytes).toBe(5);
    expect(await s.exists(rel)).toBe(true);
    expect((await s.get(rel)).toString()).toBe("hello");
  });

  it("lists files under a prefix", async () => {
    const s = getStorage();
    await s.put({ path: "projects/p/output/final.mp4", data: "a" });
    await s.put({ path: "projects/p/audio/voice.wav", data: "b" });
    const list = (await s.list("projects/p")).map((x) => x.replace(/\\/g, "/"));
    expect(list.sort()).toEqual([
      "projects/p/audio/voice.wav",
      "projects/p/output/final.mp4",
    ]);
  });

  it("refuses paths that escape the storage root", () => {
    const s = getStorage();
    expect(() => s.resolveLocal("../../etc/passwd")).toThrow();
  });

  it("remove deletes a file", async () => {
    const s = getStorage();
    await s.put({ path: "projects/p/x.txt", data: "z" });
    await s.remove("projects/p/x.txt");
    expect(await s.exists("projects/p/x.txt")).toBe(false);
  });
});
