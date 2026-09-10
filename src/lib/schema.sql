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

-- ---------------------------------------------------------------------------
-- Training Studio (brief §8). Starts now that the Phase 2 mock pipeline works.
-- Training itself runs on GPU via the worker; these tables are the control
-- plane. Every derived profile/model is versioned and never overwritten (§8.5).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS training_videos (
  id             TEXT PRIMARY KEY,
  filename       TEXT NOT NULL,
  path           TEXT NOT NULL,              -- storage-relative, under raw/
  bytes          INTEGER NOT NULL DEFAULT 0,
  mime           TEXT NOT NULL DEFAULT 'video/mp4',
  in_dataset     INTEGER NOT NULL DEFAULT 0, -- explicit "Add to Training Dataset" (§8.2)
  quality_score  INTEGER,                    -- 1-10
  quality_status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING|GOOD FOR TRAINING|NEEDS BETTER AUDIO|FACE NOT CLEAR ENOUGH|TOO MUCH BACKGROUND NOISE
  meta_json      TEXT NOT NULL DEFAULT '{}',
  created_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS datasets (
  id             TEXT PRIMARY KEY,
  label          TEXT NOT NULL,              -- "Dataset v1", "v2" ...
  version_num    INTEGER NOT NULL DEFAULT 1,
  worker_ref     TEXT NOT NULL DEFAULT '',   -- worker-side dataset dir id (real training)
  video_ids_json TEXT NOT NULL DEFAULT '[]',
  clip_count     INTEGER NOT NULL DEFAULT 0,
  speech_seconds REAL NOT NULL DEFAULT 0,
  frame_count    INTEGER NOT NULL DEFAULT 0,
  face_ok_ratio  REAL NOT NULL DEFAULT 0,
  notes          TEXT NOT NULL DEFAULT '',
  created_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS training_jobs (
  id           TEXT PRIMARY KEY,
  profile      TEXT NOT NULL,   -- voice|speaking_style|face_identity|face_performance
  level        INTEGER NOT NULL DEFAULT 1,   -- L1..L6 (§8.4)
  dataset_id   TEXT REFERENCES datasets(id) ON DELETE SET NULL,
  state        TEXT NOT NULL,   -- QUEUED|PREPROCESSING|TRANSCRIBING|BUILDING_DATASET|TRAINING|EVALUATING|COMPLETED|FAILED|CANCELLED
  stage        TEXT NOT NULL DEFAULT '',
  stage_status TEXT NOT NULL DEFAULT '',
  progress_json TEXT NOT NULL DEFAULT '{}',
  base_model   TEXT NOT NULL DEFAULT '',
  config_json  TEXT NOT NULL DEFAULT '{}',
  result_version_id TEXT,
  error        TEXT,
  created_at   TEXT NOT NULL,
  started_at   TEXT,
  ended_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_tjobs_profile ON training_jobs(profile);
CREATE INDEX IF NOT EXISTS idx_tjobs_state ON training_jobs(state);

CREATE TABLE IF NOT EXISTS model_versions (
  id              TEXT PRIMARY KEY,
  profile         TEXT NOT NULL,
  label           TEXT NOT NULL,             -- "Founder Voice v1"
  version_num     INTEGER NOT NULL DEFAULT 1,
  base_model      TEXT NOT NULL DEFAULT '',
  dataset_id      TEXT REFERENCES datasets(id) ON DELETE SET NULL,
  training_job_id TEXT REFERENCES training_jobs(id) ON DELETE SET NULL,
  eval_score      REAL,                      -- aggregate, informational
  eval_json       TEXT NOT NULL DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'experimental', -- experimental|approved|production|rejected|archived (§8.5)
  license         TEXT NOT NULL DEFAULT '',
  gpu_used        TEXT NOT NULL DEFAULT '',
  config_json     TEXT NOT NULL DEFAULT '{}',
  notes           TEXT NOT NULL DEFAULT '',
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mversions_profile ON model_versions(profile);

CREATE TABLE IF NOT EXISTS eval_runs (
  id          TEXT PRIMARY KEY,
  version_id  TEXT NOT NULL REFERENCES model_versions(id) ON DELETE CASCADE,
  test_key    TEXT NOT NULL,                 -- educational|business|excited|storytelling|cta|mixed (§8.5)
  script_text TEXT NOT NULL,
  output_path TEXT,                          -- storage-relative preview asset
  scores_json TEXT NOT NULL DEFAULT '{}',
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_evalruns_version ON eval_runs(version_id);
