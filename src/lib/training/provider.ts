/**
 * TrainingProvider — the seam for the Training Studio (brief §8).
 * `mock` fakes ingestion / dataset build / training / evaluation end-to-end with
 * no GPU. A `worker` impl (routes to the Python GPU worker) replaces it later;
 * nothing in the orchestrator or UI changes.
 */
import { config } from "../config";
import { getStorage } from "../storage";
import { makeMockWav, makeMockFacePng } from "../providers/media";
import type { Dataset, Profile, TrainingVideo } from "./types";

/* ---- interface ---- */

export interface IngestResult {
  qualityScore: number; // 1-10
  qualityStatus: string;
  meta: Record<string, unknown>;
}

export interface DatasetStats {
  clipCount: number;
  speechSeconds: number;
  frameCount: number;
  faceOkRatio: number;
}

export interface TrainResult {
  baseModel: string;
  evalScore: number; // aggregate 1-10
  evalBreakdown: Record<string, number>;
  gpuUsed: string;
  license: string;
  kind: "MOCK" | "EXPERIMENTAL" | "PRODUCTION";
}

export interface EvalResult {
  outputPath: string;
  scores: Record<string, number>;
  kind: "MOCK" | "EXPERIMENTAL" | "PRODUCTION";
}

export interface TrainingProvider {
  readonly name: string;
  ingestVideo(input: { filename: string; bytes: number; mime: string }): Promise<IngestResult>;
  buildDataset(videos: TrainingVideo[]): Promise<DatasetStats>;
  train(input: {
    profile: Profile;
    level: number;
    dataset: Dataset;
    baseModel: string;
    onStage?: (stage: string) => void;
  }): Promise<TrainResult>;
  evaluate(input: {
    profile: Profile;
    versionId: string;
    versionNum: number;
    testKey: string;
    scriptText: string;
  }): Promise<EvalResult>;
}

/* ---- deterministic helpers so mock output is stable per input ---- */

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp10 = (x: number) => Math.max(1, Math.min(10, Math.round(x * 10) / 10));

const VOICE_KEYS = [
  "pronunciation_tz",
  "accent_tz",
  "naturalness",
  "pacing",
  "pauses",
  "emphasis",
  "breathing",
  "code_switch",
  "realism",
];
const FACE_KEYS = ["identity", "no_drift", "skin_realism", "blinking", "head_motion", "realism"];
const STYLE_KEYS = ["sentence_length", "pace", "pause_pattern", "emphasis_pattern", "cta_style"];

function keysFor(profile: Profile): string[] {
  if (profile === "voice") return VOICE_KEYS;
  if (profile === "speaking_style") return STYLE_KEYS;
  return FACE_KEYS;
}

/* ---- mock implementation ---- */

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class MockTrainingProvider implements TrainingProvider {
  readonly name = "mock";

  async ingestVideo(input: { filename: string; bytes: number; mime: string }): Promise<IngestResult> {
    const r = rng(hash(input.filename + input.bytes));
    // bigger files tend to score better; small clips flagged
    const base = input.bytes < 400_000 ? 4 : input.bytes < 3_000_000 ? 7 : 8.5;
    const score = clamp10(base + (r() - 0.5) * 3);
    let status = "GOOD FOR TRAINING";
    if (score < 4) status = "TOO MUCH BACKGROUND NOISE";
    else if (score < 5.5) status = "NEEDS BETTER AUDIO";
    else if (r() < 0.15) status = "FACE NOT CLEAR ENOUGH";
    return {
      qualityScore: score,
      qualityStatus: status,
      meta: {
        est_speech_seconds: Math.round((input.bytes / 120_000) * (0.8 + r() * 0.4)),
        est_frames: Math.round((input.bytes / 500_000) * 25),
        mock: true,
      },
    };
  }

  async buildDataset(videos: TrainingVideo[]): Promise<DatasetStats> {
    let speech = 0;
    let frames = 0;
    let faceOk = 0;
    for (const v of videos) {
      speech += Number(v.meta.est_speech_seconds ?? 0);
      frames += Number(v.meta.est_frames ?? 0);
      if (v.quality_status === "GOOD FOR TRAINING") faceOk += 1;
    }
    return {
      clipCount: Math.round(speech / 6),
      speechSeconds: Math.round(speech),
      frameCount: frames,
      faceOkRatio: videos.length ? Math.round((faceOk / videos.length) * 100) / 100 : 0,
    };
  }

  async train(input: {
    profile: Profile;
    level: number;
    dataset: Dataset;
    baseModel: string;
    onStage?: (stage: string) => void;
  }): Promise<TrainResult> {
    const stages = [
      "PREPROCESSING",
      "TRANSCRIBING",
      "BUILDING_DATASET",
      "TRAINING",
      "EVALUATING",
    ];
    for (const s of stages) {
      input.onStage?.(s);
      await wait(400);
    }
    const r = rng(hash(input.profile + input.dataset.id + input.baseModel + input.level));
    // score rises with usable speech, plateaus ~8.2, then over-training can dip
    const mins = input.dataset.speech_seconds / 60;
    const curve = 8.4 * (1 - Math.exp(-mins / 12));
    const overtrainPenalty = mins > 45 ? (mins - 45) / 40 : 0;
    const agg = clamp10(curve - overtrainPenalty + (r() - 0.5) * 1.2);
    const breakdown: Record<string, number> = {};
    for (const k of keysFor(input.profile)) breakdown[k] = clamp10(agg + (r() - 0.5) * 2);
    return {
      baseModel: input.baseModel,
      evalScore: agg,
      evalBreakdown: breakdown,
      gpuUsed: "mock (no GPU)",
      license: "n/a (mock)",
      kind: "MOCK",
    };
  }

  async evaluate(input: {
    profile: Profile;
    versionId: string;
    versionNum: number;
    testKey: string;
    scriptText: string;
  }): Promise<EvalResult> {
    const storage = getStorage();
    const isFace = input.profile === "face_identity" || input.profile === "face_performance";
    const rel = `training/evals/${input.versionId}/${input.testKey}.${isFace ? "png" : "wav"}`;
    const words = input.scriptText.split(/\s+/).filter(Boolean).length;
    const data = isFace
      ? makeMockFacePng({ width: 480, height: 600 })
      : makeMockWav({ seconds: Math.max(2, words / 2.3), wordCount: words });
    await storage.put({ path: rel, data, mime: isFace ? "image/png" : "audio/wav" });

    const r = rng(hash(input.versionId + input.testKey));
    const scores: Record<string, number> = {};
    for (const k of keysFor(input.profile)) {
      scores[k] = clamp10(4 + input.versionNum * 0.7 + (r() - 0.5) * 3);
    }
    return { outputPath: rel, scores, kind: "MOCK" };
  }
}

/* ---- selector ---- */

let instance: TrainingProvider | null = null;

export function getTrainingProvider(): TrainingProvider {
  if (instance) return instance;
  switch (config.providers.training ?? "mock") {
    case "mock":
      instance = new MockTrainingProvider();
      break;
    default:
      throw new Error(`Unknown TRAINING_PROVIDER: ${config.providers.training}`);
  }
  return instance;
}

export function _setTrainingProviderForTests(p: TrainingProvider | null) {
  instance = p;
}
