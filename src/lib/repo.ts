/**
 * Thin data-access layer. The ONLY place that touches SQL. Swapping SQLite for
 * Supabase/Postgres later means rewriting this file and nothing else
 * (DECISIONS.md). Keep it boring.
 */
import { getDb } from "./db";
import { newId, nowIso } from "./ids";

export type JobState =
  | "QUEUED"
  | "PROCESSING"
  | "VOICE_GENERATING"
  | "AVATAR_GENERATING"
  | "LIP_SYNC"
  | "RENDERING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export const NON_TERMINAL_STATES: JobState[] = [
  "QUEUED",
  "PROCESSING",
  "VOICE_GENERATING",
  "AVATAR_GENERATING",
  "LIP_SYNC",
  "RENDERING",
];

export interface Project {
  id: string;
  name: string;
  script_text: string;
  created_at: string;
  updated_at: string;
}

export interface JobInputs {
  voiceId: string;
  emotion: string;
  avatarId: string;
  background: string;
  width: number;
  height: number;
}

export interface StageProgress {
  status: "pending" | "running" | "done" | "error";
  attempt: number;
  startedAt?: string;
  endedAt?: string;
  error?: string;
}

export interface Job {
  id: string;
  project_id: string;
  state: JobState;
  stage: string;
  stage_status: string;
  attempt: number;
  inputs: JobInputs;
  progress: Record<string, StageProgress>;
  error: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  ended_at: string | null;
}

export interface Asset {
  id: string;
  project_id: string;
  job_id: string | null;
  kind: "script" | "audio" | "avatar" | "lipsync" | "output";
  path: string;
  mime: string;
  bytes: number;
  meta: Record<string, unknown>;
  created_at: string;
}

/* ---------- projects ---------- */

export function createProject(name: string, scriptText = ""): Project {
  const db = getDb();
  const id = newId("proj");
  const ts = nowIso();
  db.prepare(
    `INSERT INTO projects (id, name, script_text, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, name, scriptText, ts, ts);
  return getProject(id)!;
}

export function getProject(id: string): Project | null {
  const row = getDb().prepare(`SELECT * FROM projects WHERE id = ?`).get(id) as
    | Project
    | undefined;
  return row ?? null;
}

export function listProjects(): Project[] {
  return getDb()
    .prepare(`SELECT * FROM projects ORDER BY created_at DESC`)
    .all() as Project[];
}

export function updateProjectScript(id: string, scriptText: string): void {
  getDb()
    .prepare(`UPDATE projects SET script_text = ?, updated_at = ? WHERE id = ?`)
    .run(scriptText, nowIso(), id);
}

/** Cascades to generation_jobs + assets via FK. Storage cleanup is the caller's. */
export function deleteProject(id: string): void {
  getDb().prepare(`DELETE FROM projects WHERE id = ?`).run(id);
}

/* ---------- jobs ---------- */

function rowToJob(r: Record<string, unknown>): Job {
  return {
    id: r.id as string,
    project_id: r.project_id as string,
    state: r.state as JobState,
    stage: r.stage as string,
    stage_status: r.stage_status as string,
    attempt: r.attempt as number,
    inputs: JSON.parse((r.inputs_json as string) || "{}"),
    progress: JSON.parse((r.progress_json as string) || "{}"),
    error: (r.error as string) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    started_at: (r.started_at as string) ?? null,
    ended_at: (r.ended_at as string) ?? null,
  };
}

export function createJob(projectId: string, inputs: JobInputs): Job {
  const db = getDb();
  const id = newId("job");
  const ts = nowIso();
  db.prepare(
    `INSERT INTO generation_jobs
       (id, project_id, state, stage, stage_status, attempt, inputs_json, progress_json, created_at, updated_at)
     VALUES (?, ?, 'QUEUED', '', 'pending', 0, ?, '{}', ?, ?)`,
  ).run(id, projectId, JSON.stringify(inputs), ts, ts);
  return getJob(id)!;
}

export function getJob(id: string): Job | null {
  const row = getDb()
    .prepare(`SELECT * FROM generation_jobs WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined;
  return row ? rowToJob(row) : null;
}

export function listJobsForProject(projectId: string): Job[] {
  return (
    getDb()
      .prepare(
        `SELECT * FROM generation_jobs WHERE project_id = ? ORDER BY created_at DESC`,
      )
      .all(projectId) as Record<string, unknown>[]
  ).map(rowToJob);
}

export function listRecentJobs(limit = 10): Job[] {
  return (
    getDb()
      .prepare(`SELECT * FROM generation_jobs ORDER BY created_at DESC LIMIT ?`)
      .all(limit) as Record<string, unknown>[]
  ).map(rowToJob);
}

export function listJobsByStates(states: JobState[]): Job[] {
  if (states.length === 0) return [];
  const placeholders = states.map(() => "?").join(",");
  return (
    getDb()
      .prepare(
        `SELECT * FROM generation_jobs WHERE state IN (${placeholders}) ORDER BY created_at ASC`,
      )
      .all(...states) as Record<string, unknown>[]
  ).map(rowToJob);
}

export function updateJob(
  id: string,
  patch: Partial<{
    state: JobState;
    stage: string;
    stage_status: string;
    attempt: number;
    progress: Record<string, StageProgress>;
    error: string | null;
    started_at: string | null;
    ended_at: string | null;
  }>,
): Job {
  const current = getJob(id);
  if (!current) throw new Error(`job ${id} not found`);
  const merged = {
    state: patch.state ?? current.state,
    stage: patch.stage ?? current.stage,
    stage_status: patch.stage_status ?? current.stage_status,
    attempt: patch.attempt ?? current.attempt,
    progress: patch.progress ?? current.progress,
    error: patch.error === undefined ? current.error : patch.error,
    started_at:
      patch.started_at === undefined ? current.started_at : patch.started_at,
    ended_at: patch.ended_at === undefined ? current.ended_at : patch.ended_at,
  };
  getDb()
    .prepare(
      `UPDATE generation_jobs
         SET state = ?, stage = ?, stage_status = ?, attempt = ?, progress_json = ?,
             error = ?, started_at = ?, ended_at = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      merged.state,
      merged.stage,
      merged.stage_status,
      merged.attempt,
      JSON.stringify(merged.progress),
      merged.error,
      merged.started_at,
      merged.ended_at,
      nowIso(),
      id,
    );
  return getJob(id)!;
}

/* ---------- assets ---------- */

export function addAsset(a: Omit<Asset, "id" | "created_at">): Asset {
  const db = getDb();
  const id = newId("asset");
  const ts = nowIso();
  db.prepare(
    `INSERT INTO assets (id, project_id, job_id, kind, path, mime, bytes, meta_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    a.project_id,
    a.job_id,
    a.kind,
    a.path,
    a.mime,
    a.bytes,
    JSON.stringify(a.meta ?? {}),
    ts,
  );
  return { ...a, id, created_at: ts };
}

export function listAssetsForProject(projectId: string): Asset[] {
  return (
    getDb()
      .prepare(`SELECT * FROM assets WHERE project_id = ? ORDER BY created_at DESC`)
      .all(projectId) as Record<string, unknown>[]
  ).map((r) => ({
    id: r.id as string,
    project_id: r.project_id as string,
    job_id: (r.job_id as string) ?? null,
    kind: r.kind as Asset["kind"],
    path: r.path as string,
    mime: r.mime as string,
    bytes: r.bytes as number,
    meta: JSON.parse((r.meta_json as string) || "{}"),
    created_at: r.created_at as string,
  }));
}

export function getOutputAssetForJob(jobId: string): Asset | null {
  const r = getDb()
    .prepare(
      `SELECT * FROM assets WHERE job_id = ? AND kind = 'output' ORDER BY created_at DESC LIMIT 1`,
    )
    .get(jobId) as Record<string, unknown> | undefined;
  if (!r) return null;
  return {
    id: r.id as string,
    project_id: r.project_id as string,
    job_id: (r.job_id as string) ?? null,
    kind: r.kind as Asset["kind"],
    path: r.path as string,
    mime: r.mime as string,
    bytes: r.bytes as number,
    meta: JSON.parse((r.meta_json as string) || "{}"),
    created_at: r.created_at as string,
  };
}

/* ---------- voices / avatars ---------- */

export interface VoiceRow {
  id: string;
  label: string;
  provider: string;
  is_default: number;
  status: string;
}
export interface AvatarRow {
  id: string;
  label: string;
  provider: string;
  is_default: number;
  status: string;
}

export function listVoices(): VoiceRow[] {
  return getDb()
    .prepare(`SELECT id,label,provider,is_default,status FROM voices ORDER BY is_default DESC, label`)
    .all() as VoiceRow[];
}
export function listAvatars(): AvatarRow[] {
  return getDb()
    .prepare(`SELECT id,label,provider,is_default,status FROM avatars ORDER BY is_default DESC, label`)
    .all() as AvatarRow[];
}

/* ---------- settings ---------- */

export function getSetting(key: string): string | null {
  const r = getDb().prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as
    | { value: string }
    | undefined;
  return r?.value ?? null;
}
export function setSetting(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(key, value);
}

/* ---------- seed ---------- */

/** Idempotent: one mock founder voice + one mock avatar so the UI has choices. */
export function ensureSeed(): void {
  const db = getDb();
  const ts = nowIso();
  const voiceCount = (
    db.prepare(`SELECT COUNT(*) c FROM voices`).get() as { c: number }
  ).c;
  if (voiceCount === 0) {
    db.prepare(
      `INSERT INTO voices (id,label,provider,ref_json,is_default,status,created_at)
       VALUES (?,?,?,?,1,'mock',?)`,
    ).run(newId("voice"), "Founder Voice (mock)", "mock", "{}", ts);
  }
  const avatarCount = (
    db.prepare(`SELECT COUNT(*) c FROM avatars`).get() as { c: number }
  ).c;
  if (avatarCount === 0) {
    db.prepare(
      `INSERT INTO avatars (id,label,provider,ref_json,is_default,status,created_at)
       VALUES (?,?,?,?,1,'mock',?)`,
    ).run(newId("avatar"), "Founder Avatar (mock)", "mock", "{}", ts);
  }
  if (getSetting("owner_label") === null) setSetting("owner_label", "Founder");
}
