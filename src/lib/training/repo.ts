/** Data access for the Training Studio. Same rule as src/lib/repo.ts: the only
 * place training SQL lives. */
import { getDb } from "../db";
import { newId, nowIso } from "../ids";
import type {
  Dataset,
  EvalRun,
  ModelStatus,
  ModelVersion,
  Profile,
  StageProgress,
  TrainingJob,
  TrainingState,
} from "./types";

/* ---------- videos ---------- */

function rowVideo(r: Record<string, unknown>) {
  return {
    id: r.id as string,
    filename: r.filename as string,
    path: r.path as string,
    bytes: r.bytes as number,
    mime: r.mime as string,
    in_dataset: !!(r.in_dataset as number),
    quality_score: (r.quality_score as number) ?? null,
    quality_status: r.quality_status as string,
    meta: JSON.parse((r.meta_json as string) || "{}"),
    created_at: r.created_at as string,
  };
}

export function addVideo(v: {
  filename: string;
  path: string;
  bytes: number;
  mime: string;
  qualityScore: number | null;
  qualityStatus: string;
  meta: Record<string, unknown>;
}) {
  const id = newId("asset");
  const ts = nowIso();
  getDb()
    .prepare(
      `INSERT INTO training_videos
        (id, filename, path, bytes, mime, in_dataset, quality_score, quality_status, meta_json, created_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
    )
    .run(id, v.filename, v.path, v.bytes, v.mime, v.qualityScore, v.qualityStatus, JSON.stringify(v.meta), ts);
  return getVideo(id)!;
}

export function getVideo(id: string) {
  const r = getDb().prepare(`SELECT * FROM training_videos WHERE id = ?`).get(id) as
    | Record<string, unknown>
    | undefined;
  return r ? rowVideo(r) : null;
}

export function listVideos() {
  return (
    getDb().prepare(`SELECT * FROM training_videos ORDER BY created_at DESC`).all() as Record<
      string,
      unknown
    >[]
  ).map(rowVideo);
}

export function setVideoInDataset(id: string, on: boolean) {
  getDb().prepare(`UPDATE training_videos SET in_dataset = ? WHERE id = ?`).run(on ? 1 : 0, id);
}

export function deleteVideo(id: string) {
  getDb().prepare(`DELETE FROM training_videos WHERE id = ?`).run(id);
}

/* ---------- datasets ---------- */

function rowDataset(r: Record<string, unknown>): Dataset {
  return {
    id: r.id as string,
    label: r.label as string,
    version_num: r.version_num as number,
    video_ids: JSON.parse((r.video_ids_json as string) || "[]"),
    clip_count: r.clip_count as number,
    speech_seconds: r.speech_seconds as number,
    frame_count: r.frame_count as number,
    face_ok_ratio: r.face_ok_ratio as number,
    notes: r.notes as string,
    created_at: r.created_at as string,
  };
}

export function createDataset(d: {
  videoIds: string[];
  clipCount: number;
  speechSeconds: number;
  frameCount: number;
  faceOkRatio: number;
  notes?: string;
}): Dataset {
  const n =
    ((getDb().prepare(`SELECT MAX(version_num) m FROM datasets`).get() as { m: number | null }).m ??
      0) + 1;
  const id = newId("asset");
  const ts = nowIso();
  getDb()
    .prepare(
      `INSERT INTO datasets
        (id, label, version_num, video_ids_json, clip_count, speech_seconds, frame_count, face_ok_ratio, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      `Dataset v${n}`,
      n,
      JSON.stringify(d.videoIds),
      d.clipCount,
      d.speechSeconds,
      d.frameCount,
      d.faceOkRatio,
      d.notes ?? "",
      ts,
    );
  return getDataset(id)!;
}

export function getDataset(id: string): Dataset | null {
  const r = getDb().prepare(`SELECT * FROM datasets WHERE id = ?`).get(id) as
    | Record<string, unknown>
    | undefined;
  return r ? rowDataset(r) : null;
}

export function listDatasets(): Dataset[] {
  return (
    getDb().prepare(`SELECT * FROM datasets ORDER BY version_num DESC`).all() as Record<
      string,
      unknown
    >[]
  ).map(rowDataset);
}

/* ---------- training jobs ---------- */

function rowJob(r: Record<string, unknown>): TrainingJob {
  return {
    id: r.id as string,
    profile: r.profile as Profile,
    level: r.level as number,
    dataset_id: (r.dataset_id as string) ?? null,
    state: r.state as TrainingState,
    stage: r.stage as string,
    stage_status: r.stage_status as string,
    progress: JSON.parse((r.progress_json as string) || "{}"),
    base_model: r.base_model as string,
    config: JSON.parse((r.config_json as string) || "{}"),
    result_version_id: (r.result_version_id as string) ?? null,
    error: (r.error as string) ?? null,
    created_at: r.created_at as string,
    started_at: (r.started_at as string) ?? null,
    ended_at: (r.ended_at as string) ?? null,
  };
}

export function createTrainingJob(j: {
  profile: Profile;
  level: number;
  datasetId: string;
  baseModel: string;
  config?: Record<string, unknown>;
}): TrainingJob {
  const id = newId("job");
  const ts = nowIso();
  getDb()
    .prepare(
      `INSERT INTO training_jobs
        (id, profile, level, dataset_id, state, stage, stage_status, progress_json, base_model, config_json, created_at)
       VALUES (?, ?, ?, ?, 'QUEUED', '', 'pending', '{}', ?, ?, ?)`,
    )
    .run(id, j.profile, j.level, j.datasetId, j.baseModel, JSON.stringify(j.config ?? {}), ts);
  return getTrainingJob(id)!;
}

export function getTrainingJob(id: string): TrainingJob | null {
  const r = getDb().prepare(`SELECT * FROM training_jobs WHERE id = ?`).get(id) as
    | Record<string, unknown>
    | undefined;
  return r ? rowJob(r) : null;
}

export function listTrainingJobs(): TrainingJob[] {
  return (
    getDb().prepare(`SELECT * FROM training_jobs ORDER BY created_at DESC`).all() as Record<
      string,
      unknown
    >[]
  ).map(rowJob);
}

export function listTrainingJobsByStates(states: TrainingState[]): TrainingJob[] {
  if (!states.length) return [];
  const q = states.map(() => "?").join(",");
  return (
    getDb()
      .prepare(`SELECT * FROM training_jobs WHERE state IN (${q}) ORDER BY created_at ASC`)
      .all(...states) as Record<string, unknown>[]
  ).map(rowJob);
}

export function updateTrainingJob(
  id: string,
  patch: Partial<{
    state: TrainingState;
    stage: string;
    stage_status: string;
    progress: Record<string, StageProgress>;
    base_model: string;
    result_version_id: string | null;
    error: string | null;
    started_at: string | null;
    ended_at: string | null;
  }>,
): TrainingJob {
  const cur = getTrainingJob(id);
  if (!cur) throw new Error(`training job ${id} not found`);
  const m = {
    state: patch.state ?? cur.state,
    stage: patch.stage ?? cur.stage,
    stage_status: patch.stage_status ?? cur.stage_status,
    progress: patch.progress ?? cur.progress,
    base_model: patch.base_model ?? cur.base_model,
    result_version_id:
      patch.result_version_id === undefined ? cur.result_version_id : patch.result_version_id,
    error: patch.error === undefined ? cur.error : patch.error,
    started_at: patch.started_at === undefined ? cur.started_at : patch.started_at,
    ended_at: patch.ended_at === undefined ? cur.ended_at : patch.ended_at,
  };
  getDb()
    .prepare(
      `UPDATE training_jobs SET state=?, stage=?, stage_status=?, progress_json=?, base_model=?,
        result_version_id=?, error=?, started_at=?, ended_at=? WHERE id=?`,
    )
    .run(
      m.state,
      m.stage,
      m.stage_status,
      JSON.stringify(m.progress),
      m.base_model,
      m.result_version_id,
      m.error,
      m.started_at,
      m.ended_at,
      id,
    );
  return getTrainingJob(id)!;
}

/* ---------- model versions ---------- */

function rowVersion(r: Record<string, unknown>): ModelVersion {
  return {
    id: r.id as string,
    profile: r.profile as Profile,
    label: r.label as string,
    version_num: r.version_num as number,
    base_model: r.base_model as string,
    dataset_id: (r.dataset_id as string) ?? null,
    training_job_id: (r.training_job_id as string) ?? null,
    eval_score: (r.eval_score as number) ?? null,
    eval: JSON.parse((r.eval_json as string) || "{}"),
    status: r.status as ModelStatus,
    license: r.license as string,
    gpu_used: r.gpu_used as string,
    config: JSON.parse((r.config_json as string) || "{}"),
    notes: r.notes as string,
    created_at: r.created_at as string,
  };
}

const PROFILE_LABEL: Record<Profile, string> = {
  voice: "Founder Voice",
  speaking_style: "Speaking Style",
  face_identity: "Face Identity",
  face_performance: "Face Performance",
};

export function nextVersionNum(profile: Profile): number {
  return (
    ((
      getDb()
        .prepare(`SELECT MAX(version_num) m FROM model_versions WHERE profile = ?`)
        .get(profile) as { m: number | null }
    ).m ?? 0) + 1
  );
}

export function createVersion(v: {
  profile: Profile;
  baseModel: string;
  datasetId: string | null;
  trainingJobId: string | null;
  evalScore: number | null;
  evalJson?: Record<string, unknown>;
  license?: string;
  gpuUsed?: string;
  config?: Record<string, unknown>;
}): ModelVersion {
  const n = nextVersionNum(v.profile);
  const id = newId("asset");
  const ts = nowIso();
  getDb()
    .prepare(
      `INSERT INTO model_versions
        (id, profile, label, version_num, base_model, dataset_id, training_job_id, eval_score, eval_json,
         status, license, gpu_used, config_json, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'experimental', ?, ?, ?, '', ?)`,
    )
    .run(
      id,
      v.profile,
      `${PROFILE_LABEL[v.profile]} v${n}`,
      n,
      v.baseModel,
      v.datasetId,
      v.trainingJobId,
      v.evalScore,
      JSON.stringify(v.evalJson ?? {}),
      v.license ?? "",
      v.gpuUsed ?? "",
      JSON.stringify(v.config ?? {}),
      ts,
    );
  return getVersion(id)!;
}

export function getVersion(id: string): ModelVersion | null {
  const r = getDb().prepare(`SELECT * FROM model_versions WHERE id = ?`).get(id) as
    | Record<string, unknown>
    | undefined;
  return r ? rowVersion(r) : null;
}

export function listVersions(profile?: Profile): ModelVersion[] {
  const rows = profile
    ? getDb()
        .prepare(`SELECT * FROM model_versions WHERE profile = ? ORDER BY version_num DESC`)
        .all(profile)
    : getDb().prepare(`SELECT * FROM model_versions ORDER BY profile, version_num DESC`).all();
  return (rows as Record<string, unknown>[]).map(rowVersion);
}

export function productionVersion(profile: Profile): ModelVersion | null {
  const r = getDb()
    .prepare(
      `SELECT * FROM model_versions WHERE profile = ? AND status = 'production' ORDER BY version_num DESC LIMIT 1`,
    )
    .get(profile) as Record<string, unknown> | undefined;
  return r ? rowVersion(r) : null;
}

export function setVersionStatus(id: string, status: ModelStatus): ModelVersion {
  const v = getVersion(id);
  if (!v) throw new Error("version not found");
  // only one PRODUCTION per profile — demote the current one to approved
  if (status === "production") {
    getDb()
      .prepare(
        `UPDATE model_versions SET status = 'approved' WHERE profile = ? AND status = 'production'`,
      )
      .run(v.profile);
  }
  getDb().prepare(`UPDATE model_versions SET status = ? WHERE id = ?`).run(status, id);
  return getVersion(id)!;
}

export function setVersionNotes(id: string, notes: string) {
  getDb().prepare(`UPDATE model_versions SET notes = ? WHERE id = ?`).run(notes, id);
}

/* ---------- eval runs ---------- */

function rowEval(r: Record<string, unknown>): EvalRun {
  return {
    id: r.id as string,
    version_id: r.version_id as string,
    test_key: r.test_key as string,
    script_text: r.script_text as string,
    output_path: (r.output_path as string) ?? null,
    scores: JSON.parse((r.scores_json as string) || "{}"),
    created_at: r.created_at as string,
  };
}

export function addEvalRun(e: {
  versionId: string;
  testKey: string;
  scriptText: string;
  outputPath: string | null;
  scores: Record<string, number>;
}): EvalRun {
  const id = newId("asset");
  const ts = nowIso();
  getDb()
    .prepare(
      `INSERT INTO eval_runs (id, version_id, test_key, script_text, output_path, scores_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, e.versionId, e.testKey, e.scriptText, e.outputPath, JSON.stringify(e.scores), ts);
  return rowEval(
    getDb().prepare(`SELECT * FROM eval_runs WHERE id = ?`).get(id) as Record<string, unknown>,
  );
}

export function listEvalRuns(versionId: string): EvalRun[] {
  return (
    getDb()
      .prepare(`SELECT * FROM eval_runs WHERE version_id = ? ORDER BY created_at DESC`)
      .all(versionId) as Record<string, unknown>[]
  ).map(rowEval);
}
