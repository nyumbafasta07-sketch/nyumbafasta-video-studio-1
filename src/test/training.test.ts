import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { freshEnv, type TestEnv } from "./helpers";
import {
  addVideo,
  createDataset,
  createTrainingJob,
  createVersion,
  getVersion,
  listDatasets,
  listEvalRuns,
  listVersions,
  productionVersion,
  setVideoInDataset,
  setVersionStatus,
  listVideos,
} from "@/lib/training/repo";
import { getTrainingProvider, _setTrainingProviderForTests, MockTrainingProvider } from "@/lib/training/provider";
import type { TrainingProvider } from "@/lib/training/provider";
import { runTrainingJob } from "@/lib/training/orchestrator";
import { getStorage } from "@/lib/storage";
import { getDb } from "@/lib/db";
import { loadModelBundle } from "@/lib/training/model-bundles";

let env: TestEnv;
beforeEach(() => {
  env = freshEnv();
  _setTrainingProviderForTests(null);
});
afterEach(() => env.cleanup());

function seedDataset() {
  const v1 = addVideo({
    filename: "biz.mp4", path: "raw/biz.mp4", bytes: 5_000_000, mime: "video/mp4",
    qualityScore: 8, qualityStatus: "GOOD FOR TRAINING",
    meta: { est_speech_seconds: 600, est_frames: 250 },
  });
  const v2 = addVideo({
    filename: "story.mp4", path: "raw/story.mp4", bytes: 4_000_000, mime: "video/mp4",
    qualityScore: 7, qualityStatus: "GOOD FOR TRAINING",
    meta: { est_speech_seconds: 500, est_frames: 200 },
  });
  setVideoInDataset(v1.id, true);
  setVideoInDataset(v2.id, true);
  return createDataset({
    videoIds: [v1.id, v2.id],
    clipCount: 180,
    speechSeconds: 1100,
    frameCount: 450,
    faceOkRatio: 1,
  });
}

describe("training repo", () => {
  it("versions datasets and models incrementally", () => {
    seedDataset();
    seedDataset();
    const ds = listDatasets();
    expect(ds.map((d) => d.label)).toEqual(["Dataset v2", "Dataset v1"]);

    const a = createVersion({ profile: "voice", baseModel: "b", datasetId: ds[0].id, trainingJobId: null, evalScore: 7 });
    const b = createVersion({ profile: "voice", baseModel: "b", datasetId: ds[0].id, trainingJobId: null, evalScore: 8 });
    expect(a.label).toBe("Founder Voice v1");
    expect(b.label).toBe("Founder Voice v2");
    expect(a.status).toBe("experimental");
  });

  it("enforces status transitions and single production per profile", () => {
    const ds = seedDataset();
    const v1 = createVersion({ profile: "voice", baseModel: "b", datasetId: ds.id, trainingJobId: null, evalScore: 7 });
    const v2 = createVersion({ profile: "voice", baseModel: "b", datasetId: ds.id, trainingJobId: null, evalScore: 8 });

    setVersionStatus(v1.id, "approved");
    setVersionStatus(v1.id, "production");
    expect(productionVersion("voice")!.id).toBe(v1.id);

    setVersionStatus(v2.id, "approved");
    setVersionStatus(v2.id, "production");
    // v1 demoted to approved, v2 is the only production
    expect(getVersion(v1.id)!.status).toBe("approved");
    expect(productionVersion("voice")!.id).toBe(v2.id);
  });
});

describe("mock training provider", () => {
  it("ingest gives a bounded score + status", async () => {
    const p = getTrainingProvider();
    const r = await p.ingestVideo({ filename: "x.mp4", bytes: 5_000_000, mime: "video/mp4" });
    expect(r.qualityScore).toBeGreaterThanOrEqual(1);
    expect(r.qualityScore).toBeLessThanOrEqual(10);
    expect(typeof r.qualityStatus).toBe("string");
  });

  it("train is deterministic and rewards more speech", async () => {
    const p = getTrainingProvider();
    const small = await p.train({
      profile: "voice", level: 1, baseModel: "b",
      dataset: { ...fakeDs(), speech_seconds: 120 },
    });
    const big = await p.train({
      profile: "voice", level: 1, baseModel: "b",
      dataset: { ...fakeDs(), speech_seconds: 1500 },
    });
    expect(big.evalScore).toBeGreaterThan(small.evalScore);
    expect(Object.keys(big.evalBreakdown).length).toBeGreaterThan(3);
    expect(big.kind).toBe("MOCK");
  });
});

function fakeDs() {
  return {
    id: "ds_x", label: "Dataset v1", version_num: 1, worker_ref: "", video_ids: [],
    clip_count: 0, speech_seconds: 0, frame_count: 0, face_ok_ratio: 0,
    notes: "", created_at: new Date().toISOString(),
  };
}

describe("training orchestrator (end-to-end mock)", () => {
  it("runs a job -> COMPLETED, creates a version + eval runs + preview assets", async () => {
    const ds = seedDataset();
    const job = createTrainingJob({
      profile: "voice", level: 1, datasetId: ds.id, baseModel: "piper/base",
    });
    const done = await runTrainingJob(job.id);
    expect(done.state).toBe("COMPLETED");
    expect(done.result_version_id).toBeTruthy();

    const version = getVersion(done.result_version_id!)!;
    expect(version.profile).toBe("voice");
    expect(version.status).toBe("experimental");
    expect(version.eval_score).toBeGreaterThan(0);

    const evals = listEvalRuns(version.id);
    expect(evals.length).toBe(6); // one per fixed EVAL_SCRIPTS entry
    const storage = getStorage();
    expect(await storage.exists(evals[0].output_path!)).toBe(true);

    expect(listVersions("voice")).toHaveLength(1);
  });

  it("exports and persists a voice model bundle centrally after a successful train", async () => {
    class FakeWorker extends MockTrainingProvider implements TrainingProvider {
      exportCalls: string[] = [];
      async train(input: Parameters<TrainingProvider["train"]>[0]) {
        const r = await super.train(input);
        return { ...r, modelRef: "voice-fake-123" };
      }
      async exportModel(kind: string, modelRef: string) {
        this.exportCalls.push(`${kind}:${modelRef}`);
        return Buffer.from("fake-checkpoint-bytes");
      }
    }
    const fake = new FakeWorker();
    _setTrainingProviderForTests(fake);

    const ds = seedDataset();
    const job = createTrainingJob({ profile: "voice", level: 1, datasetId: ds.id, baseModel: "b" });
    const done = await runTrainingJob(job.id);
    expect(done.state).toBe("COMPLETED");

    expect(fake.exportCalls).toEqual(["voice:voice-fake-123"]);
    const bundle = await loadModelBundle("voice", "voice-fake-123");
    expect(bundle?.toString()).toBe("fake-checkpoint-bytes");
  });

  it("a training success is not undone when the model export step fails", async () => {
    class FlakyExportWorker extends MockTrainingProvider implements TrainingProvider {
      async train(input: Parameters<TrainingProvider["train"]>[0]) {
        const r = await super.train(input);
        return { ...r, modelRef: "voice-flaky-1" };
      }
      async exportModel(): Promise<Buffer | undefined> {
        throw new Error("worker artifact endpoint down");
      }
    }
    _setTrainingProviderForTests(new FlakyExportWorker());

    const ds = seedDataset();
    const job = createTrainingJob({ profile: "voice", level: 1, datasetId: ds.id, baseModel: "b" });
    const done = await runTrainingJob(job.id);
    expect(done.state).toBe("COMPLETED"); // export failure must not fail the job
    expect(await loadModelBundle("voice", "voice-flaky-1")).toBeNull();
  });

  it("runs a job for every profile end-to-end (mock)", async () => {
    for (const profile of [
      "voice",
      "face_identity",
      "face_performance",
      "lipsync",
      "speaking_style",
    ] as const) {
      const ds = seedDataset();
      const job = createTrainingJob({ profile, level: 1, datasetId: ds.id, baseModel: "b" });
      const done = await runTrainingJob(job.id);
      expect(done.state, profile).toBe("COMPLETED");
      const v = getVersion(done.result_version_id!)!;
      expect(v.profile).toBe(profile);
      expect(listEvalRuns(v.id).length).toBe(6);
    }
  });

  it("fails cleanly when the dataset is gone before the job runs", async () => {
    const ds = seedDataset();
    const job = createTrainingJob({
      profile: "voice", level: 1, datasetId: ds.id, baseModel: "b",
    });
    // dataset deleted after creation -> FK ON DELETE SET NULL nulls job.dataset_id
    getDb().prepare(`DELETE FROM datasets WHERE id = ?`).run(ds.id);
    const done = await runTrainingJob(job.id);
    expect(done.state).toBe("FAILED");
    expect(done.error).toBeTruthy();
  });
});

describe("training video dataset marking", () => {
  it("only marked videos count", () => {
    const a = addVideo({
      filename: "a.mp4", path: "raw/a", bytes: 1, mime: "video/mp4",
      qualityScore: 6, qualityStatus: "GOOD FOR TRAINING", meta: {},
    });
    addVideo({
      filename: "b.mp4", path: "raw/b", bytes: 1, mime: "video/mp4",
      qualityScore: 6, qualityStatus: "GOOD FOR TRAINING", meta: {},
    });
    setVideoInDataset(a.id, true);
    expect(listVideos().filter((v) => v.in_dataset)).toHaveLength(1);
  });
});
