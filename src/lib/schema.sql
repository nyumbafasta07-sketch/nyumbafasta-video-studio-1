-- Minimal schema from ENGINEERING_BRIEF.md §6. Seven tables. No `users` table
-- (single-user, no role logic). Portable SQL so a later port to Postgres/Supabase
-- is mechanical (see DECISIONS.md).

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  script_text TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS generation_jobs (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  state        TEXT NOT NULL,               -- QUEUED|PROCESSING|VOICE_GENERATING|AVATAR_GENERATING|LIP_SYNC|RENDERING|COMPLETED|FAILED|CANCELLED
  stage        TEXT NOT NULL DEFAULT '',    -- current pipeline stage key
  stage_status TEXT NOT NULL DEFAULT '',    -- pending|running|done|error
  attempt      INTEGER NOT NULL DEFAULT 0,  -- retry count for the current stage
  inputs_json  TEXT NOT NULL DEFAULT '{}',  -- {voiceId,emotion,avatarId,background,width,height}
  progress_json TEXT NOT NULL DEFAULT '{}', -- {stageKey: {status,attempt,startedAt,endedAt,error}}
  error        TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  started_at   TEXT,
  ended_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_jobs_project ON generation_jobs(project_id);
CREATE INDEX IF NOT EXISTS idx_jobs_state ON generation_jobs(state);

CREATE TABLE IF NOT EXISTS assets (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  job_id     TEXT REFERENCES generation_jobs(id) ON DELETE SET NULL,
  kind       TEXT NOT NULL,                 -- script|audio|avatar|lipsync|output
  path       TEXT NOT NULL,                 -- storage-relative path, never absolute
  mime       TEXT NOT NULL DEFAULT 'application/octet-stream',
  bytes      INTEGER NOT NULL DEFAULT 0,
  meta_json  TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_assets_project ON assets(project_id);
CREATE INDEX IF NOT EXISTS idx_assets_job ON assets(job_id);

CREATE TABLE IF NOT EXISTS voices (
  id         TEXT PRIMARY KEY,
  label      TEXT NOT NULL,
  provider   TEXT NOT NULL,                 -- mock|local_rvc|elevenlabs|...
  ref_json   TEXT NOT NULL DEFAULT '{}',    -- reference sample pointers / config
  is_default INTEGER NOT NULL DEFAULT 0,
  status     TEXT NOT NULL DEFAULT 'mock',  -- mock|experimental|production  (never blurred)
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS avatars (
  id         TEXT PRIMARY KEY,
  label      TEXT NOT NULL,
  provider   TEXT NOT NULL,
  ref_json   TEXT NOT NULL DEFAULT '{}',
  is_default INTEGER NOT NULL DEFAULT 0,
  status     TEXT NOT NULL DEFAULT 'mock',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS providers (
  id          TEXT PRIMARY KEY,             -- voice|face|lipsync|script|gpu|renderer
  impl        TEXT NOT NULL,                -- current implementation name
  config_json TEXT NOT NULL DEFAULT '{}',
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
