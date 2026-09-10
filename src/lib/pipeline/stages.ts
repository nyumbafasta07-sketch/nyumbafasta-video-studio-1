/**
 * The 8 pipeline stages (brief §7). Each stage is independently retryable and
 * idempotent: it writes to a deterministic storage path, so a retry (or a
 * crash-recovery resume) re-runs only what is missing, using the persisted
 * outputs of earlier stages.
 */
import { getStorage, projectPaths } from "../storage";
import {
  getFaceProvider,
  getLipSyncProvider,
  getRenderer,
  getScriptProvider,
  getVoiceProvider,
} from "../providers";
import type { JobInputs, JobState } from "../repo";
import type {
  FaceResult,
  LipSyncResult,
  RenderResult,
  ScriptAnalysis,
  VoiceResult,
} from "../providers/types";

export interface PipelineCtx {
  projectId: string;
  jobId: string;
  scriptText: string;
  inputs: JobInputs;
  analysis?: ScriptAnalysis;
  voice?: VoiceResult;
  face?: FaceResult;
  lipsync?: LipSyncResult;
  output?: RenderResult;
}

export interface Stage {
  key: string;
  /** job.state to set while this stage runs */
  state: JobState;
  maxAttempts: number;
  /** true if this stage's artifact already exists (resume without re-running) */
  isDone(ctx: PipelineCtx): Promise<boolean>;
  run(ctx: PipelineCtx): Promise<void>;
}

const p = (projectId: string) => projectPaths(projectId);

export const STAGES: Stage[] = [
  {
    key: "validate_script",
    state: "PROCESSING",
    maxAttempts: 1,
    async isDone(ctx) {
      return getStorage().exists(`${p(ctx.projectId).script}/analysis.json`);
    },
    async run(ctx) {
      const analysis = await getScriptProvider().analyze({ text: ctx.scriptText });
      if (!analysis.normalizedText) throw new Error("Script is empty after normalisation.");
      ctx.analysis = analysis;
      const storage = getStorage();
      await storage.put({
        path: `${p(ctx.projectId).script}/normalized.txt`,
        data: analysis.normalizedText,
        mime: "text/plain",
      });
      await storage.put({
        path: `${p(ctx.projectId).script}/analysis.json`,
        data: JSON.stringify(analysis, null, 2),
        mime: "application/json",
      });
    },
  },

  {
    key: "snapshot_inputs",
    state: "PROCESSING",
    maxAttempts: 1,
    async isDone(ctx) {
      return getStorage().exists(`${p(ctx.projectId).script}/job-${ctx.jobId}.json`);
    },
    async run(ctx) {
      await getStorage().put({
        path: `${p(ctx.projectId).script}/job-${ctx.jobId}.json`,
        data: JSON.stringify({ jobId: ctx.jobId, inputs: ctx.inputs }, null, 2),
        mime: "application/json",
      });
    },
  },

  {
    key: "generate_audio",
    state: "VOICE_GENERATING",
    maxAttempts: 3,
    async isDone(ctx) {
      return getStorage().exists(`${p(ctx.projectId).audio}/voice.wav`);
    },
    async run(ctx) {
      const text = ctx.analysis?.normalizedText ?? ctx.scriptText;
      ctx.voice = await getVoiceProvider().synthesize({
        projectId: ctx.projectId,
        text,
        voiceId: ctx.inputs.voiceId,
        emotion: ctx.inputs.emotion,
        outDir: p(ctx.projectId).audio,
      });
    },
  },

  {
    key: "generate_face",
    state: "AVATAR_GENERATING",
    maxAttempts: 3,
    async isDone(ctx) {
      return getStorage().exists(`${p(ctx.projectId).avatar}/face.png`);
    },
    async run(ctx) {
      ctx.face = await getFaceProvider().render({
        projectId: ctx.projectId,
        avatarId: ctx.inputs.avatarId,
        width: ctx.inputs.width,
        height: ctx.inputs.height,
        outDir: p(ctx.projectId).avatar,
      });
    },
  },

  {
    key: "lip_sync",
    state: "LIP_SYNC",
    maxAttempts: 3,
    async isDone(ctx) {
      return getStorage().exists(`${p(ctx.projectId).lipsync}/talking.mp4`);
    },
    async run(ctx) {
      ctx.lipsync = await getLipSyncProvider().sync({
        projectId: ctx.projectId,
        facePath: `${p(ctx.projectId).avatar}/face.png`,
        audioPath: `${p(ctx.projectId).audio}/voice.wav`,
        width: ctx.inputs.width,
        height: ctx.inputs.height,
        outDir: p(ctx.projectId).lipsync,
      });
    },
  },

  {
    key: "render_video",
    state: "RENDERING",
    maxAttempts: 2,
    async isDone(ctx) {
      return getStorage().exists(`${p(ctx.projectId).output}/final.mp4`);
    },
    async run(ctx) {
      ctx.output = await getRenderer().render({
        projectId: ctx.projectId,
        lipSyncPath: `${p(ctx.projectId).lipsync}/talking.mp4`,
        audioPath: `${p(ctx.projectId).audio}/voice.wav`,
        backgroundHex: ctx.inputs.background,
        width: ctx.inputs.width,
        height: ctx.inputs.height,
        outDir: p(ctx.projectId).output,
        captionText: undefined,
      });
    },
  },

  {
    key: "validate_output",
    state: "RENDERING",
    maxAttempts: 1,
    async isDone() {
      return false; // always re-validate; it's cheap and catches corrupt files
    },
    async run(ctx) {
      const storage = getStorage();
      const rel = `${p(ctx.projectId).output}/final.mp4`;
      if (!(await storage.exists(rel))) throw new Error("final.mp4 missing");
      const buf = await storage.get(rel);
      if (buf.byteLength < 1024) throw new Error("final.mp4 is suspiciously small");
      if (ctx.output) {
        if (ctx.output.durationSeconds <= 0) throw new Error("output has zero duration");
        if (!ctx.output.hasAudio) throw new Error("output has no audio track");
        const { width: ew, height: eh } = ctx.inputs;
        if (ctx.output.width !== ew || ctx.output.height !== eh) {
          throw new Error(
            `output resolution ${ctx.output.width}x${ctx.output.height} != ${ew}x${eh}`,
          );
        }
      }
    },
  },

  {
    key: "store_output",
    state: "RENDERING",
    maxAttempts: 1,
    async isDone() {
      return false; // finalisation is recorded by the orchestrator
    },
    async run() {
      // The renderer already persisted final.mp4. The orchestrator records the
      // asset row and flips the job to COMPLETED after this stage.
    },
  },
];
