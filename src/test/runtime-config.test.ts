import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { freshEnv, type TestEnv } from "./helpers";
import {
  getRuntimeConfig,
  redactedRuntimeConfig,
  setRuntimeConfig,
  onProviderConfigChange,
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
