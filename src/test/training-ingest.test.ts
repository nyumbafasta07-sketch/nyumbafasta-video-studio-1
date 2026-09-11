import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { freshEnv, type TestEnv } from "./helpers";
import { enqueueIngest } from "@/lib/training/ingest";
import { addVideo, getVideo } from "@/lib/training/repo";
import { _setTrainingProviderForTests } from "@/lib/training/provider";
import type { TrainingProvider } from "@/lib/training/provider";

let env: TestEnv;
beforeEach(() => {
  env = freshEnv();
  _setTrainingProviderForTests(null);
});
afterEach(() => {
  env.cleanup();
  _setTrainingProviderForTests(null);
});

function waitUntil(cond: () => boolean, timeoutMs = 2000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (cond()) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error("timed out waiting"));
      setTimeout(tick, 10);
    };
    tick();
  });
}

describe("background video ingestion", () => {
  it("upload never blocks on the provider: video starts PENDING, updates when ingest resolves", async () => {
    const v = addVideo({
      filename: "a.mp4", path: "raw/a.mp4", bytes: 1, mime: "video/mp4",
      qualityScore: null, qualityStatus: "PENDING", meta: {},
    });

    let resolveIngest!: (v: { qualityScore: number; qualityStatus: string; meta: Record<string, unknown> }) => void;
    const slow: TrainingProvider = {
      name: "slow",
      ingestVideo: () => new Promise((res) => (resolveIngest = res)),
      buildDataset: async () => ({ clipCount: 0, speechSeconds: 0, frameCount: 0, faceOkRatio: 0 }),
      train: async () => ({ baseModel: "", evalScore: 0, evalBreakdown: {}, gpuUsed: "", license: "", kind: "MOCK" }),
      evaluate: async () => ({ outputPath: "", scores: {}, kind: "MOCK" }),
    };
    _setTrainingProviderForTests(slow);

    enqueueIngest(v.id, { filename: "a.mp4", bytes: 1, mime: "video/mp4", localPath: "raw/a.mp4" });

    // let the queued microtask start running (and reach its own await) —
    // the upload response itself never waits on this
    await Promise.resolve();
    await Promise.resolve();
    expect(getVideo(v.id)!.quality_status).toBe("PENDING");
    expect(resolveIngest).toBeTypeOf("function");

    resolveIngest({ qualityScore: 8, qualityStatus: "GOOD FOR TRAINING", meta: { ok: true } });
    await waitUntil(() => getVideo(v.id)!.quality_status !== "PENDING");
    expect(getVideo(v.id)!.quality_status).toBe("GOOD FOR TRAINING");
    expect(getVideo(v.id)!.quality_score).toBe(8);
  });

  it("a failed ingest marks the video INGEST FAILED with the error in meta, not a crash", async () => {
    const v = addVideo({
      filename: "b.mp4", path: "raw/b.mp4", bytes: 1, mime: "video/mp4",
      qualityScore: null, qualityStatus: "PENDING", meta: {},
    });
    const failing: TrainingProvider = {
      name: "failing",
      ingestVideo: async () => {
        throw new Error("worker unreachable: connect ECONNREFUSED");
      },
      buildDataset: async () => ({ clipCount: 0, speechSeconds: 0, frameCount: 0, faceOkRatio: 0 }),
      train: async () => ({ baseModel: "", evalScore: 0, evalBreakdown: {}, gpuUsed: "", license: "", kind: "MOCK" }),
      evaluate: async () => ({ outputPath: "", scores: {}, kind: "MOCK" }),
    };
    _setTrainingProviderForTests(failing);

    enqueueIngest(v.id, { filename: "b.mp4", bytes: 1, mime: "video/mp4", localPath: "raw/b.mp4" });
    await waitUntil(() => getVideo(v.id)!.quality_status !== "PENDING");

    const after = getVideo(v.id)!;
    expect(after.quality_status).toBe("INGEST FAILED");
    expect(after.quality_score).toBeNull();
    expect(String(after.meta.error)).toContain("ECONNREFUSED");
  });
});
