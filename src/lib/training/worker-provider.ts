/**
 * WorkerTrainingProvider — EXPERIMENTAL, untested (needs a real GPU worker).
 * Routes the Training Studio's work to a Python worker over HTTP. Worker URL +
 * token come from the runtime config (Settings UI), so the worker can run on
 * Colab, Kaggle, a local NVIDIA box, or anywhere else.
 *
 * Contract: worker/contract.md §Training. Everything goes through
 *   POST /run   { type, payload }            -> { jobId }
 *   GET  /jobs/{id}                          -> { status, result?, artifactUrl?, ... }
 *   GET  {artifactUrl}                       -> bytes (evaluate previews only)
 */
import { getStorage } from "../storage";
import { getRuntimeConfig } from "../runtime-config";
import type { Dataset, Profile, TrainingVideo } from "./types";
import type {
  DatasetStats,
  EvalResult,
  IngestResult,
  TrainResult,
  TrainingProvider,
} from "./provider";

function cfg() {
  const rc = getRuntimeConfig();
  return { base: rc.gpuWorkerUrl.replace(/\/$/, ""), token: rc.gpuWorkerToken };
}
function headers(): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json" };
  const { token } = cfg();
  if (token) h.authorization = `Bearer ${token}`;
  return h;
}

interface JobBody {
  status: "queued" | "running" | "done" | "error";
  stage?: string;
  error?: string;
  result?: Record<string, unknown>;
  artifactUrl?: string;
  mime?: string;
}

async function run(
  type: string,
  payload: Record<string, unknown>,
  onStage?: (stage: string) => void,
  maxPolls = 60 * 60, // up to ~1h for a real fine-tune
): Promise<JobBody> {
  const { base } = cfg();
  if (!base) throw new Error("GPU worker URL not set (Settings → GPU)");
  const submit = await fetch(`${base}/run`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ type, payload }),
  });
  if (!submit.ok) throw new Error(`worker /run ${submit.status}`);
  const { jobId } = (await submit.json()) as { jobId: string };

  let lastStage = "";
  for (let i = 0; i < maxPolls; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const s = await fetch(`${base}/jobs/${jobId}`, { headers: headers() });
    if (!s.ok) throw new Error(`worker /jobs ${s.status}`);
    const body = (await s.json()) as JobBody;
    if (body.stage && body.stage !== lastStage) {
      lastStage = body.stage;
      onStage?.(body.stage);
    }
    if (body.status === "error") throw new Error(body.error ?? "worker error");
    if (body.status === "done") return body;
  }
  throw new Error("worker job timed out");
}

export class WorkerTrainingProvider implements TrainingProvider {
  readonly name = "worker";

  async ingestVideo(input: {
    filename: string;
    bytes: number;
    mime: string;
    localPath?: string;
  }): Promise<IngestResult> {
    let fileB64: string | undefined;
    if (input.localPath) {
      const buf = await getStorage().get(input.localPath);
      fileB64 = buf.toString("base64");
    }
    const body = await run("ingest", {
      filename: input.filename,
      mime: input.mime,
      fileB64,
    });
    const r = body.result ?? {};
    return {
      qualityScore: Number(r.qualityScore ?? 0),
      qualityStatus: String(r.qualityStatus ?? "PENDING"),
      meta: (r.meta as Record<string, unknown>) ?? {},
    };
  }

  async buildDataset(videos: TrainingVideo[]): Promise<DatasetStats> {
    const body = await run("build_dataset", {
      videos: videos.map((v) => ({ id: v.id, meta: v.meta, quality_status: v.quality_status })),
    });
    const r = body.result ?? {};
    return {
      clipCount: Number(r.clipCount ?? 0),
      speechSeconds: Number(r.speechSeconds ?? 0),
      frameCount: Number(r.frameCount ?? 0),
      faceOkRatio: Number(r.faceOkRatio ?? 0),
      workerRef: r.workerRef ? String(r.workerRef) : undefined,
    };
  }

  async train(input: {
    profile: Profile;
    level: number;
    dataset: Dataset;
    baseModel: string;
    resumeFromModelRef?: string;
    onStage?: (stage: string) => void;
  }): Promise<TrainResult> {
    const body = await run(
      "train",
      {
        profile: input.profile,
        level: input.level,
        datasetId: input.dataset.id,
        datasetRef: input.dataset.worker_ref,
        datasetStats: {
          clipCount: input.dataset.clip_count,
          speechSeconds: input.dataset.speech_seconds,
          frameCount: input.dataset.frame_count,
        },
        baseModel: input.baseModel,
        resumeFromModelRef: input.resumeFromModelRef ?? "",
      },
      (stage) => input.onStage?.(stage.toUpperCase()),
    );
    const r = body.result ?? {};
    return {
      baseModel: String(r.baseModel ?? input.baseModel),
      evalScore: Number(r.evalScore ?? 0),
      evalBreakdown: (r.evalBreakdown as Record<string, number>) ?? {},
      gpuUsed: String(r.gpuUsed ?? "worker"),
      license: String(r.license ?? ""),
      kind: (r.kind as TrainResult["kind"]) ?? "EXPERIMENTAL",
      modelRef: r.modelRef ? String(r.modelRef) : undefined,
      styleProfile: r.styleProfile ? (r.styleProfile as Record<string, unknown>) : undefined,
    };
  }

  async evaluate(input: {
    profile: Profile;
    versionId: string;
    versionNum: number;
    testKey: string;
    scriptText: string;
    modelRef?: string;
  }): Promise<EvalResult> {
    const body = await run("evaluate", {
      profile: input.profile,
      versionId: input.versionId,
      testKey: input.testKey,
      scriptText: input.scriptText,
      modelRef: input.modelRef ?? "",
    });
    const r = body.result ?? {};
    const isFace = input.profile === "face_identity" || input.profile === "face_performance";
    const rel = `training/evals/${input.versionId}/${input.testKey}.${isFace ? "png" : "wav"}`;
    if (body.artifactUrl) {
      const { base } = cfg();
      const a = await fetch(`${base}${body.artifactUrl}`, { headers: headers() });
      if (a.ok) {
        await getStorage().put({
          path: rel,
          data: Buffer.from(await a.arrayBuffer()),
          mime: body.mime ?? (isFace ? "image/png" : "audio/wav"),
        });
      }
    }
    return {
      outputPath: rel,
      scores: (r.scores as Record<string, number>) ?? {},
      kind: (r.kind as EvalResult["kind"]) ?? "EXPERIMENTAL",
    };
  }

  async exportModel(kind: string, modelRef: string): Promise<Buffer | undefined> {
    const body = await run("export_model", { kind, modelRef });
    if (!body.artifactUrl) return undefined;
    const { base } = cfg();
    const a = await fetch(`${base}${body.artifactUrl}`, { headers: headers() });
    if (!a.ok) return undefined;
    return Buffer.from(await a.arrayBuffer());
  }

  async importModel(kind: string, modelRef: string, bundle: Buffer): Promise<void> {
    await run("import_model", { kind, modelRef, bundleB64: bundle.toString("base64") });
  }
}
