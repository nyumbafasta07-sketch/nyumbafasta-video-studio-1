/**
 * Runs a training job (brief §8.5). Mirrors the generation orchestrator: staged,
 * cancel-aware, writes state to the DB. On success it creates a versioned model
 * (never overwrites, §8.5) and runs the fixed evaluation scripts so the founder
 * has something concrete to judge.
 */
import { logger } from "../logger";
import { nowIso } from "../ids";
import {
  addEvalRun,
  createVersion,
  getDataset,
  getTrainingJob,
  listTrainingJobsByStates,
  updateTrainingJob,
} from "./repo";
import { getTrainingProvider } from "./provider";
import { saveModelBundle } from "./model-bundles";
import { EVAL_SCRIPTS, TRAINING_NON_TERMINAL, type TrainingJob, type TrainingState } from "./types";

/**
 * Next.js dev mode re-evaluates a server module (resetting its module-level
 * state) whenever a file in its dependency chain changes — even an unrelated
 * one, like a repo.ts helper edited for a different feature. Plain `const
 * started = new Set()` here would then forget a job it already kicked off,
 * so the next sweep resubmits `train` to the worker AGAIN while the first
 * submission is still running — two concurrent fine-tunes fighting over the
 * same GPU. Confirmed live (2026-09-12): a job's displayed `state` flickered
 * PREPROCESSING/TRAINING because two run() calls were each polling a
 * DIFFERENT worker jobId and overwriting the same DB row. Stashing these
 * Sets on globalThis survives that module re-evaluation (the standard
 * Next.js dev workaround for this class of bug — same reason Prisma client
 * singletons use it).
 */
const g = globalThis as unknown as {
  __trainingInFlight?: Set<string>;
  __trainingStarted?: Set<string>;
  __trainingLastSweep?: number;
};
const inFlight = (g.__trainingInFlight ??= new Set<string>());
const started = (g.__trainingStarted ??= new Set<string>());

export function enqueueTraining(jobId: string): void {
  if (started.has(jobId)) return;
  started.add(jobId);
  queueMicrotask(() => {
    runTrainingJob(jobId)
      .catch((e) => logger.error("training job crashed", { jobId, error: String(e) }))
      .finally(() => started.delete(jobId));
  });
}

export function sweepTraining(): void {
  const now = Date.now();
  if (now - (g.__trainingLastSweep ?? 0) < 3000) return;
  g.__trainingLastSweep = now;
  for (const job of listTrainingJobsByStates(TRAINING_NON_TERMINAL)) {
    if (!started.has(job.id)) enqueueTraining(job.id);
  }
}

export async function runTrainingJob(jobId: string): Promise<TrainingJob> {
  if (inFlight.has(jobId)) return getTrainingJob(jobId)!;
  inFlight.add(jobId);
  try {
    return await run(jobId);
  } finally {
    inFlight.delete(jobId);
  }
}

function cancelled(id: string): boolean {
  return getTrainingJob(id)?.state === "CANCELLED";
}

async function run(jobId: string): Promise<TrainingJob> {
  let job = getTrainingJob(jobId);
  if (!job) throw new Error(`training job ${jobId} not found`);
  if (job.state === "COMPLETED" || job.state === "CANCELLED") return job;

  const dataset = job.dataset_id ? getDataset(job.dataset_id) : null;
  if (!dataset) {
    return updateTrainingJob(job.id, {
      state: "FAILED",
      error: "dataset not found",
      ended_at: nowIso(),
    });
  }

  job = updateTrainingJob(job.id, {
    state: "PREPROCESSING",
    stage: "preprocess",
    stage_status: "running",
    error: null,
    started_at: job.started_at ?? nowIso(),
  });
  logger.job("training_start", { projectId: job.profile, jobId: job.id, stage: "preprocess" });

  const provider = getTrainingProvider();
  const progress = { ...job.progress };
  const mark = (stage: string, status: "running" | "done" | "error", error?: string) => {
    progress[stage] = {
      status,
      attempt: 1,
      startedAt: progress[stage]?.startedAt ?? nowIso(),
      endedAt: status === "running" ? undefined : nowIso(),
      error,
    };
  };

  const STATE_FOR: Record<string, TrainingState> = {
    PREPROCESSING: "PREPROCESSING",
    TRANSCRIBING: "TRANSCRIBING",
    BUILDING_DATASET: "BUILDING_DATASET",
    TRAINING: "TRAINING",
    EVALUATING: "EVALUATING",
  };

  let result;
  try {
    result = await provider.train({
      profile: job.profile,
      level: job.level,
      dataset,
      baseModel: job.base_model || "(mock base)",
      onStage: (stage) => {
        if (cancelled(job!.id)) return;
        const st = STATE_FOR[stage] ?? "TRAINING";
        mark(stage.toLowerCase(), "running");
        updateTrainingJob(job!.id, {
          state: st,
          stage: stage.toLowerCase(),
          stage_status: "running",
          progress,
        });
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    mark(job.stage || "training", "error", msg);
    return updateTrainingJob(job.id, {
      state: "FAILED",
      stage_status: "error",
      error: msg,
      progress,
      ended_at: nowIso(),
    });
  }

  if (cancelled(job.id)) {
    logger.job("training_cancelled", { projectId: job.profile, jobId: job.id });
    return getTrainingJob(job.id)!;
  }

  for (const k of Object.keys(STATE_FOR)) mark(k.toLowerCase(), "done");

  // versioned model (§8.5) — status starts EXPERIMENTAL
  const version = createVersion({
    profile: job.profile,
    baseModel: result.baseModel,
    datasetId: dataset.id,
    trainingJobId: job.id,
    evalScore: result.evalScore,
    evalJson: { breakdown: result.evalBreakdown, kind: result.kind },
    license: result.license,
    gpuUsed: result.gpuUsed,
    config: { ...job.config, modelRef: result.modelRef ?? "" },
  });

  // Persist the trained model centrally so switching GPU workers later
  // doesn't lose it (every worker session is ephemeral — see model-bundles.ts).
  // Best-effort: a training run that already succeeded shouldn't be marked
  // FAILED just because the export step had a hiccup.
  if (job.profile === "voice" && result.modelRef && provider.exportModel) {
    try {
      const bundle = await provider.exportModel("voice", result.modelRef);
      if (bundle) await saveModelBundle("voice", result.modelRef, bundle);
    } catch (e) {
      logger.error("model export failed (training itself succeeded)", {
        jobId: job.id, modelRef: result.modelRef, error: String(e),
      });
    }
  }

  // fixed evaluation scripts (§8.5) so there is something to A/B
  mark("evaluating", "running");
  updateTrainingJob(job.id, { state: "EVALUATING", stage: "evaluating", progress });
  for (const s of EVAL_SCRIPTS) {
    if (cancelled(job.id)) break;
    const ev = await provider.evaluate({
      profile: job.profile,
      versionId: version.id,
      versionNum: version.version_num,
      testKey: s.key,
      scriptText: s.text,
      modelRef: result.modelRef,
    });
    addEvalRun({
      versionId: version.id,
      testKey: s.key,
      scriptText: s.text,
      outputPath: ev.outputPath,
      scores: ev.scores,
    });
  }
  mark("evaluating", "done");

  const done = updateTrainingJob(job.id, {
    state: "COMPLETED",
    stage: "completed",
    stage_status: "done",
    base_model: result.baseModel,
    result_version_id: version.id,
    error: null,
    progress,
    ended_at: nowIso(),
  });
  logger.job("training_completed", {
    projectId: job.profile,
    jobId: job.id,
    model: version.label,
  });
  return done;
}
