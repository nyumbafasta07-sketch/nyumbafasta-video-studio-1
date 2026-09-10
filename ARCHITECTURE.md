# ARCHITECTURE

Status of this document: **PHASE 1 / PHASE 2**. Describes what exists now (mock
skeleton) and the seams that Phases 3-6 plug real models into. Anything marked
MOCK is deliberately fake output; anything marked SEAM is an interface with a
mock impl today and a real impl later.

See `ENGINEERING_BRIEF.md` for product scope and the non-negotiable principles.
See `DECISIONS.md` for why each choice was made.

---

## 1. High-level shape

```
 ┌──────────────────────────────────────────────────────────┐
 │  Browser (Chromebook / phone on LAN / founder's laptop)   │
 │  - input, control, download only. No inference here.      │
 │  - installable PWA shell (offline app shell, not offline  │
 │    generation).                                            │
 └───────────────┬──────────────────────────────────────────┘
                 │  HTTP (local / LAN only, password-gated)
 ┌───────────────▼──────────────────────────────────────────┐
 │  Next.js 14 app  (src/app)                                │
 │  - UI routes + API route handlers (nodejs runtime)        │
 │  - session gate (middleware.ts)                           │
 │  - Orchestrator: runs the 8-stage pipeline, per-stage     │
 │    retry, writes job state to DB                          │
 │  - Repo layer (src/lib/repo.ts) -> SQLite (node:sqlite)   │
 │  - StorageProvider -> local filesystem (storage/)         │
 └───────────────┬──────────────────────────────────────────┘
                 │  GPUProvider contract  (SEAM)
        ┌────────┴─────────┐
        │                  │
 ┌──────▼───────┐   ┌──────▼─────────────────────────────────┐
 │ local-mock   │   │ http -> Python worker (worker/)         │
 │ (in-process  │   │ Colab / Kaggle / local NVIDIA later.    │
 │  TS mocks,   │   │ Same job contract. Mock impl today,     │
 │  Phase 2     │   │ real TTS / face / lip-sync from Phase 3.│
 │  default)    │   │                                        │
 └──────────────┘   └────────────────────────────────────────┘
```

The browser never talks to the GPU worker directly. The Next.js app is the only
thing that holds credentials and the only thing that reaches compute.

---

## 2. Provider interfaces (SEAMs)

All in `src/lib/providers/`. Each has a `mock` implementation now. Selection is
by env var (`*_PROVIDER=...`). Adding a real model = add one file, flip one env
var. No UI or orchestrator changes.

| Interface        | Contract (essence)                                   | Phase 2 impl        | Real impl phase |
|------------------|-----------------------------------------------------|---------------------|-----------------|
| `ScriptProvider` | text -> `{ normalizedText, segments[], warnings[] }` | `mock` (rule-based) | 3 (analysis)    |
| `VoiceProvider`  | text + voiceId + emotion -> audio asset              | `mock` (tone/beeps) | 3               |
| `FaceProvider`   | avatarId -> still/idle-frames asset                  | `mock` (green PNG)  | 4               |
| `LipSyncProvider`| face asset + audio -> talking video (no bg)          | `mock` (static+bar) | 5               |
| `VideoRenderer`  | talking video + bg -> final 1080x1920 9:16 MP4       | `ffmpeg-static`     | 6 (quality)     |
| `StorageProvider`| put/get/list/signed local path, per-project layout   | `local` (fs)        | n/a (fs is fine)|
| `GPUProvider`    | submit job -> poll -> fetch artifacts                | `local-mock`        | 3 (`http`)      |

`GPUProvider` is the migration boundary from the brief §2.3 / §9: cloud -> local
changes only this implementation.

---

## 3. Generation pipeline (src/lib/pipeline)

Eight stages from brief §7. The orchestrator runs them in order; **each stage is
independently retryable** — a failure at stage 5 re-runs stage 5 using the
persisted outputs of stages 1-4, it does not restart the job.

```
1 validate_script    -> ScriptProvider.analyze
2 create_job         -> (row already created; this stage records inputs snapshot)
3 generate_audio     -> VoiceProvider.synthesize        (via GPUProvider)
4 generate_face      -> FaceProvider.render              (via GPUProvider)
5 lip_sync           -> LipSyncProvider.sync            (via GPUProvider)
6 render_video       -> VideoRenderer.render (green screen, 1080x1920, 9:16)
7 validate_output    -> probe MP4: duration>0, resolution, has audio
8 store_output       -> StorageProvider.put final/, mark job COMPLETED
```

Job state machine (brief §7):

```
QUEUED -> PROCESSING -> VOICE_GENERATING -> AVATAR_GENERATING -> LIP_SYNC
       -> RENDERING -> COMPLETED
                    \-> FAILED       (any stage, after retries exhausted)
                    \-> CANCELLED    (user request)
```

Each stage writes: `stage`, `stage_status`, `attempt`, `started_at`, `ended_at`,
`error`. Stage artifacts are written to storage before the next stage starts, so
retries and crash-recovery are cheap.

Execution model (Phase 2): in-process. Creating a job kicks off
`processJob(id)` (not awaited). A sweep on server start and on each status poll
picks up jobs left in a non-terminal state (crash recovery). No broker
(`DECISIONS.md`). This is swappable for the `http` GPUProvider without touching
the orchestrator.

---

## 4. Storage layout (brief §7)

Filesystem root = `STORAGE_DIR` (default `./storage`, git-ignored). Never exposed
to the client as a raw path; downloads go through `/api/jobs/[id]/download`.

```
storage/
  projects/{projectId}/
    script/     normalized text, analysis json
    audio/      voice output (wav/mp3)
    avatar/     face frames / still
    lip-sync/   talking-head clip (pre background)
    output/     final MP4 + render metadata json
  raw/          (Phase 3+) original founder uploads, kept, never auto-deleted
  processed/    (Phase 3+) cleaned training data, separate from raw
```

---

## 5. Data model (SQLite, brief §6 minimal schema)

`src/lib/schema.sql`. Seven core tables, no `users` table (single-user). The
Training Studio adds five more (§8): `training_videos`, `datasets`,
`training_jobs`, `model_versions`, `eval_runs`.

- `projects` — id, name, script_text, created_at, updated_at
- `generation_jobs` — id, project_id, state, stage, stage_status, attempt,
  inputs_json (voice/emotion/avatar/bg/resolution), error, timestamps
- `assets` — id, project_id, job_id, kind (script|audio|avatar|lipsync|output),
  path, mime, bytes, meta_json, created_at
- `voices` — id, label, provider, ref_json, is_default, status (mock|experimental|production)
- `avatars` — id, label, provider, ref_json, is_default, status
- `providers` — id (voice|face|lipsync|script|gpu|renderer), impl, config_json, updated_at
- `settings` — key, value (singleton-ish KV: owner label, defaults, feature flags)

`status` columns use the brief's vocabulary: `mock` / `experimental` /
`production` — never blurred.

---

## 6. Auth (brief §3)

`middleware.ts` gates everything except `/login`, `/api/auth/login`, static
assets, and the manifest. Session = HMAC-signed cookie (`SESSION_SECRET`),
verified per request. Password checked against `APP_PASSWORD_HASH` (scrypt).
No user table, no roles, no registration.

---

## 7. Logging (brief §7)

`src/lib/logger.ts`. Per generation: project id, job id, provider, model/impl,
stage, start/end, duration, error. Structured JSON lines to stdout and
`storage/logs/jobs.log`. Never logs secrets, the password hash, session secret,
or cookie values.

---

## 8. Training Studio (brief §8) — `src/lib/training`, `/training`

Control plane for building the founder's profiles. Training itself runs on GPU
via the worker; the app manages data, jobs, versions, and evaluation.

- **Seam:** `TrainingProvider` (`src/lib/training/provider.ts`) —
  `ingestVideo` / `buildDataset` / `train` / `evaluate`. `mock` impl fakes all
  four with no GPU (score rises with usable speech, dips past ~45 min to model
  §8.6). `TRAINING_PROVIDER=worker` routes to the Python GPU worker later — no
  UI/orchestrator change.
- **Tables:** `training_videos` (uploads + quality score + explicit
  `in_dataset` flag, §8.2), `datasets` (immutable snapshots, versioned),
  `training_jobs` (staged like §7: PREPROCESSING → TRANSCRIBING →
  BUILDING_DATASET → TRAINING → EVALUATING → COMPLETED/FAILED/CANCELLED),
  `model_versions` (never overwritten; `experimental → approved → production`,
  `rejected`/`archived` terminal; one production per profile), `eval_runs`
  (fixed Swahili scripts §8.5, preview asset per run).
- **Profiles** (§8.3, built independently): voice, speaking_style,
  face_identity, face_performance. Levels L1–L6 (§8.4) tracked, not all built.
- **Orchestrator:** `src/lib/training/orchestrator.ts` — same pattern as the
  generation pipeline (staged, cancel-aware, in-process runner + sweep).
- **Privacy (§8.7):** raw uploads under `storage/raw/`, kept, never served
  except through the auth-gated `/api/training/assets` route which is confined
  to the `training/` prefix (eval previews only — never raw or model files).

## 9. What is intentionally NOT here yet

Real models, real GPU training code, Supabase, multi-user anything, captions,
b-roll, posting, timeline editor. See `FUTURE_FEATURES.md` and `ROADMAP.md`.
The Python worker in `worker/` is a **contract reference**, not production
inference. The Training Studio above is **mock** — real training plugs in
behind `TrainingProvider`.

---

## 10. Folder structure

```
ENGINEERING_BRIEF.md   ARCHITECTURE.md  ROADMAP.md  DECISIONS.md
FUTURE_FEATURES.md     SECURITY.md      SETUP.md    README.md
.env.example
package.json  tsconfig.json  next.config.mjs  vitest.config.ts

src/
  middleware.ts
  app/
    layout.tsx  globals.css  page.tsx           # dashboard
    login/page.tsx
    projects/page.tsx  projects/[id]/page.tsx
    create/page.tsx
    assets/page.tsx  models/page.tsx  settings/page.tsx
    api/
      auth/login/route.ts   auth/logout/route.ts
      projects/route.ts     projects/[id]/route.ts
      jobs/route.ts         jobs/[id]/route.ts   jobs/[id]/download/route.ts
      manifest/route.ts
  lib/
    config.ts  db.ts  schema.sql  repo.ts  auth.ts  session.ts  logger.ts  ids.ts
    storage/   types.ts  local.ts  index.ts
    providers/ types.ts  index.ts
               script/mock.ts   voice/mock.ts   face/mock.ts   lipsync/mock.ts
               renderer/ffmpeg.ts
               gpu/types.ts  gpu/local-mock.ts  gpu/http.ts
    pipeline/  orchestrator.ts  stages.ts  runner.ts
  test/  auth.test.ts  projects.test.ts  jobs.test.ts
         providers.test.ts  pipeline.test.ts  storage.test.ts

public/  sw.js  icons/
worker/  README.md  contract.md  worker.py  requirements.txt
storage/ (git-ignored, created at runtime)
```
