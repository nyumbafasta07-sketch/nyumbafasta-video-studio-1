/**
 * Runs a job through STAGES. Per-stage retry with backoff; a stage failure after
 * its attempts are exhausted fails the job without restarting earlier stages
 * (brief §7). Idempotent stages + isDone() checks make crash-recovery a resume,
 * not a restart.
 */
import { getStorage, projectPaths } from "../storage";
import { logger } from "../logger";
import {
  addAsset,
  getJob,
  getProject,
  updateJob,
  type Job,
  type StageProgress,
} from "../repo";
import { STAGES, type PipelineCtx } from "./stages";
import { nowIso } from "../ids";

const inFlight = new Set<string>();

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function processJob(jobId: string): Promise<Job> {
  if (inFlight.has(jobId)) return getJob(jobId)!;
  inFlight.add(jobId);
  try {
    return await run(jobId);
  } finally {
    inFlight.delete(jobId);
  }
}

async function run(jobId: string): Promise<Job> {
  let job = getJob(jobId);
  if (!job) throw new Error(`job ${jobId} not found`);
  if (job.state === "COMPLETED" || job.state === "CANCELLED") return job;

  const project = getProject(job.project_id);
  if (!project) throw new Error(`project ${job.project_id} not found`);

  const ctx: PipelineCtx = {
    projectId: project.id,
    jobId: job.id,
    scriptText: project.script_text,
    inputs: job.inputs,
  };

  job = updateJob(job.id, {
    state: "PROCESSING",
    error: null,
    started_at: job.started_at ?? nowIso(),
  });
  logger.job("start", { projectId: project.id, jobId: job.id });

  for (const stage of STAGES) {
    if (getJob(job.id)!.state === "CANCELLED") {
      logger.job("cancelled", { projectId: project.id, jobId: job.id, stage: stage.key });
      return getJob(job.id)!;
    }

    const progress = { ...getJob(job.id)!.progress };

    if (await stage.isDone(ctx)) {
      progress[stage.key] = { status: "done", attempt: 0, endedAt: nowIso() };
      updateJob(job.id, { stage: stage.key, stage_status: "done", progress });
      logger.job("stage_skip", { projectId: project.id, jobId: job.id, stage: stage.key });
      continue;
    }

    let lastErr: unknown;
    let ok = false;
    for (let attempt = 1; attempt <= stage.maxAttempts; attempt++) {
      const startedAt = nowIso();
      const sp: StageProgress = { status: "running", attempt, startedAt };
      progress[stage.key] = sp;
      updateJob(job.id, {
        state: stage.state,
        stage: stage.key,
        stage_status: "running",
        attempt,
        progress,
      });
      const t0 = Date.now();
      try {
        await stage.run(ctx);
        progress[stage.key] = {
          status: "done",
          attempt,
          startedAt,
          endedAt: nowIso(),
        };
        updateJob(job.id, { stage_status: "done", progress });
        logger.job("stage_done", {
          projectId: project.id,
          jobId: job.id,
          stage: stage.key,
          durationMs: Date.now() - t0,
        });
        ok = true;
        break;
      } catch (err) {
        lastErr = err;
        const message = err instanceof Error ? err.message : String(err);
        progress[stage.key] = {
          status: "error",
          attempt,
          startedAt,
          endedAt: nowIso(),
          error: message,
        };
        updateJob(job.id, { stage_status: "error", progress, error: message });
        logger.job("stage_error", {
          projectId: project.id,
          jobId: job.id,
          stage: stage.key,
          durationMs: Date.now() - t0,
          error: message,
        });
        if (attempt < stage.maxAttempts) await sleep(400 * attempt);
      }
    }

    if (!ok) {
      const message =
        lastErr instanceof Error ? lastErr.message : String(lastErr ?? "unknown error");
      const failed = updateJob(job.id, {
        state: "FAILED",
        stage: stage.key,
        stage_status: "error",
        error: message,
        ended_at: nowIso(),
      });
      logger.job("failed", {
        projectId: project.id,
        jobId: job.id,
        stage: stage.key,
        error: message,
      });
      return failed;
    }
  }

  // finalise: record the output asset row + mark COMPLETED
  const storage = getStorage();
  const outRel = `${projectPaths(project.id).output}/final.mp4`;
  const outBuf = await storage.get(outRel);
  addAsset({
    project_id: project.id,
    job_id: job.id,
    kind: "output",
    path: outRel,
    mime: "video/mp4",
    bytes: outBuf.byteLength,
    meta: {
      width: ctx.output?.width ?? ctx.inputs.width,
      height: ctx.output?.height ?? ctx.inputs.height,
      durationSeconds: ctx.output?.durationSeconds ?? null,
      provider: ctx.output?.provider ?? "ffmpeg",
      model: ctx.output?.model ?? null,
      kind: ctx.output?.kind ?? "MOCK",
    },
  });

  // also record the intermediate assets for the Assets page
  await recordIntermediateAssets(project.id, job.id, ctx);

  const done = updateJob(job.id, {
    state: "COMPLETED",
    stage: "store_output",
    stage_status: "done",
    error: null,
    ended_at: nowIso(),
  });
  logger.job("completed", { projectId: project.id, jobId: job.id });
  return done;
}

async function recordIntermediateAssets(
  projectId: string,
  jobId: string,
  ctx: PipelineCtx,
): Promise<void> {
  const storage = getStorage();
  const paths = projectPaths(projectId);
  const wanted: Array<{ kind: "script" | "audio" | "avatar" | "lipsync"; rel: string; mime: string }> = [
    { kind: "script", rel: `${paths.script}/normalized.txt`, mime: "text/plain" },
    { kind: "audio", rel: `${paths.audio}/voice.wav`, mime: "audio/wav" },
    { kind: "avatar", rel: `${paths.avatar}/face.png`, mime: "image/png" },
    { kind: "lipsync", rel: `${paths.lipsync}/talking.mp4`, mime: "video/mp4" },
  ];
  for (const w of wanted) {
    if (!(await storage.exists(w.rel))) continue;
    const buf = await storage.get(w.rel);
    addAsset({
      project_id: projectId,
      job_id: jobId,
      kind: w.kind,
      path: w.rel,
      mime: w.mime,
      bytes: buf.byteLength,
      meta: {},
    });
  }
  void ctx;
}
