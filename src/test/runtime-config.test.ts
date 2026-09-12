import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { freshEnv, type TestEnv } from "./helpers";
import {
  getRuntimeConfig,
  redactedRuntimeConfig,
  setRuntimeConfig,
  onProviderConfigChange,
  saveGpuProfile,
  listGpuProfiles,
  deleteGpuProfile,
  activateGpuProfile,
  getActiveGpuProfileId,
} from "@/lib/runtime-config";
import { getGpu } from "@/lib/providers/gpu";
import { getTrainingProvider } from "@/lib/training/provider";

let env: TestEnv;
beforeEach(() => {
  env = freshEnv();
});
afterEach(() => env.cleanup());

describe("runtime config", () => {
  it("falls back to env defaults, then DB overrides win", () => {
    // vitest env sets GPU_PROVIDER=local-mock, TRAINING_PROVIDER not set (-> mock)
    const d = getRuntimeConfig();
    expect(d.gpuProvider).toBe("local-mock");
    expect(d.trainingProvider).toBe("mock");
    expect(d.gpuWorkerUrl).toBe("");

    setRuntimeConfig({
      gpuProvider: "http",
      trainingProvider: "worker",
      gpuWorkerUrl: "https://box.local:8800/",
      gpuWorkerToken: "secret-abc",
    });

    const o = getRuntimeConfig();
    expect(o.gpuProvider).toBe("http");
    expect(o.trainingProvider).toBe("worker");
    expect(o.gpuWorkerUrl).toBe("https://box.local:8800"); // trailing slash trimmed
    expect(o.gpuWorkerToken).toBe("secret-abc");
  });

  it("redacts the token to a boolean for the API", () => {
    setRuntimeConfig({ gpuWorkerToken: "t0ken" });
    const r = redactedRuntimeConfig();
    expect(r.gpuWorkerTokenSet).toBe(true);
    expect((r as Record<string, unknown>).gpuWorkerToken).toBeUndefined();
  });

  it("empty token string does not overwrite a stored token", () => {
    setRuntimeConfig({ gpuWorkerToken: "keep-me" });
    setRuntimeConfig({ gpuWorkerToken: "" });
    expect(getRuntimeConfig().gpuWorkerToken).toBe("keep-me");
  });

  it("a config change resets memoised provider instances", () => {
    let hits = 0;
    onProviderConfigChange(() => hits++);
    const g1 = getGpu();
    expect(g1.name).toBe("local-mock");

    setRuntimeConfig({ gpuProvider: "http", gpuWorkerUrl: "https://w" });
    expect(hits).toBeGreaterThan(0);
    expect(getGpu().name).toBe("http");

    setRuntimeConfig({ trainingProvider: "worker", gpuWorkerUrl: "https://w" });
    expect(getTrainingProvider().name).toBe("worker");

    setRuntimeConfig({ trainingProvider: "mock" });
    expect(getTrainingProvider().name).toBe("mock");
  });
});

describe("GPU profiles — any name, not a fixed set", () => {
  it("creates a profile with a generated id and lists it", () => {
    const id = saveGpuProfile({ label: "RunPod", url: "https://box:8800", token: "t1" });
    const list = listGpuProfiles();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id, label: "RunPod", url: "https://box:8800" });
  });

  it("updates an existing profile by id without a new token clearing the old one", () => {
    const id = saveGpuProfile({ label: "Colab", url: "https://a", token: "secret" });
    saveGpuProfile({ id, label: "Colab v2", url: "https://b" }); // no token in this call
    const [p] = listGpuProfiles();
    expect(p).toMatchObject({ id, label: "Colab v2", url: "https://b", token: "secret" });
  });

  it("activating a profile copies its url/token into the active fields and switches to http/worker", () => {
    const id = saveGpuProfile({ label: "Kaggle", url: "https://k:8800", token: "kt" });
    const profile = activateGpuProfile(id);
    expect(profile.url).toBe("https://k:8800");
    expect(getActiveGpuProfileId()).toBe(id);
    const rc = getRuntimeConfig();
    expect(rc.gpuWorkerUrl).toBe("https://k:8800");
    expect(rc.gpuWorkerToken).toBe("kt");
    expect(rc.gpuProvider).toBe("http");
    expect(rc.trainingProvider).toBe("worker");
  });

  it("activating a profile with no saved URL throws", () => {
    const id = saveGpuProfile({ label: "Empty" });
    expect(() => activateGpuProfile(id)).toThrow();
  });

  it("deleting a profile removes it and clears the active marker if it was active", () => {
    const id = saveGpuProfile({ label: "Temp", url: "https://t:8800" });
    activateGpuProfile(id);
    deleteGpuProfile(id);
    expect(listGpuProfiles()).toHaveLength(0);
    expect(getActiveGpuProfileId()).toBe("");
  });

  it("a manual worker URL edit clears the active-profile marker", () => {
    const id = saveGpuProfile({ label: "Colab", url: "https://a:8800" });
    activateGpuProfile(id);
    expect(getActiveGpuProfileId()).toBe(id);
    setRuntimeConfig({ gpuWorkerUrl: "https://manual:8800" });
    expect(getActiveGpuProfileId()).toBe("");
  });
});
