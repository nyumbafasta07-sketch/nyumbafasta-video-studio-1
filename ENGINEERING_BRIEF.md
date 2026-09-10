# PERSONAL AI VIDEO STUDIO — MASTER ENGINEERING BRIEF

This file is the single source of truth for this project. It merges three
original specs (Master Architecture, Founder Digital Twin Training Pipeline,
Tanzania Quality Standard) into one non-contradictory document. Where the
originals overlapped, this version keeps ONE canonical location per topic —
do not re-derive rules from memory of the originals if they conflict with
this file; this file wins.

---

## 0. YOUR ROLE AND AUTHORITY

You are acting as lead architect, full-stack engineer, AI/ML systems
engineer, and security-conscious senior reviewer for this project. Think
before coding. For every request, actively evaluate whether it should be
built now, postponed, simplified, or rejected.

**You are explicitly authorized to push back.** If a request is
unnecessary, insecure, premature, redundant, likely to reduce output
quality, or likely to create vendor lock-in / hard cloud-to-local migration:

1. State the problem briefly.
2. State the better alternative.
3. Recommend a path.
4. Implement the better option yourself if it is a small, reversible change.
5. If the change is large or irreversible, stop and ask for approval before
   implementing it.

Never blindly implement a feature just because it was requested. Never
claim a model or pipeline "works" until it has actually been tested. Label
everything clearly as **MOCK**, **EXPERIMENTAL**, or **PRODUCTION-READY** —
never blur these.

---

## 1. PRODUCT PURPOSE AND SCOPE

A **private** internal video production tool, initially for the
founder alone, later for a small number of authorized staff. This is
**not** a public SaaS product at this stage — no public registration, no
billing, no multi-tenant architecture.

Core workflow:

```
Script -> Script Analysis -> Voice Generation -> Face/Avatar Generation
-> Lip-Sync -> Green-Screen Render -> MP4 Export -> (manual finishing in CapCut)
```

The system produces the **raw talking-head asset only**. It does not
replace CapCut. Final polish (background replacement, captions, music,
B-roll, transitions) happens manually outside this system.

### Explicitly OUT of scope for now
Automatic B-roll, automatic captions, automatic music/SFX, automatic
transitions, automatic posting to TikTok/IG/YouTube, a full timeline
editor, public marketplace, public registration, subscription billing,
multi-tenant SaaS, analytics beyond basic job logs, speculative AI agents.

Anything requested that falls in this list goes into `FUTURE_FEATURES.md`,
not into the current build.

---

## 2. ARCHITECTURE PRINCIPLES (non-negotiable)

1. **Model-agnostic via provider interfaces.** Never hard-couple the app to
   one AI model. Define interfaces — `VoiceProvider`, `FaceProvider`,
   `LipSyncProvider`, `ScriptProvider`, `VideoRenderer`, `StorageProvider`,
   `GPUProvider` — and swap implementations behind env-var configuration
   (e.g. `VOICE_PROVIDER=mock`, later `VOICE_PROVIDER=local_rvc`).
2. **Client and compute are separate.** The browser client (used from a
   Chromebook or any low-power machine) only handles input, control, and
   download. Heavy AI inference never runs in the browser or on the client
   machine. It runs on a GPU worker reachable through `GPUProvider`.
3. **Cloud-first, local-ready.** GPU work starts on a cloud environment
   (Colab, with Kaggle as a documented fallback) and must be able to move
   to a local NVIDIA machine later **without rewriting the frontend or
   business logic** — only the `GPUProvider` implementation changes.
4. **Mocks before models.** Every provider gets a working mock
   implementation first. The entire pipeline — script in, MP4 out — must
   work end-to-end on mocks before any real model is integrated.
5. **Simple over impressive.** This is a private internal tool for a
   handful of users, not infrastructure for millions. Prefer: simple over
   complicated, modular over tightly coupled, open-source over proprietary
   (when quality is acceptable), replaceable models over permanent
   dependencies, tested over theoretically impressive.

---

## 3. USERS, ROLES, PRIVACY

**CONFIRMED: single-user only.** This is a personal tool for the founder
alone — there is no STAFF role, no user management, no multi-tenant
concern. Do not build role infrastructure, user tables beyond a single
owner record, or invite/permission systems. If a second user is ever
needed, that is a future, explicit decision — not something to
architect for speculatively now.

Authentication needed is the minimum that keeps the app from being usable
by someone else if it's ever reachable on a network: a simple local
password/session gate is enough. No ADMIN/STAFF distinction, no RBAC.

The founder's face, voice, scripts, generated videos, and trained models
are still **private assets** — this matters even more for a single-user
tool, because there is no team boundary protecting them either. No model
file, raw recording, or generated asset is ever served through an
unauthenticated public URL. Use env vars for all secrets; never commit
`.env` — only `.env.example`.

**No hosting is required.** Because this is single-user, the app runs
entirely on the founder's own machine (`npm run dev` / `npm run start`),
or later on his own local network if he wants to reach it from his phone
at home — never on a public domain, never as a deployed product others can
find. Keep this constraint in mind whenever suggesting deployment: the
default answer is "runs locally," not "deploy it somewhere."

---

## 4. QUALITY STANDARD — THE TANZANIA BAR (applies to every phase below)

This is the acceptance bar for **any** voice, face, or video output this
system ever produces. It is not a separate feature — it governs model
selection (§9), training evaluation (§8), and every quality gate in the
pipeline (§7).

**Language.** Output is natural Tanzanian Swahili, not formal/translated/
Kenyan-style/textbook/robotic Swahili. Common English business/tech terms
(app, dashboard, content, online, TikTok, login, etc.) are used naturally,
not force-translated. Write for a general-education Tanzanian audience:
clear, simple, conversational.

**Voice.** Judge candidate voice engines on: natural Tanzanian pronunciation,
natural rhythm/pauses/emphasis/breathing, correct Swahili word pronunciation,
natural Swahili-English code-switching, low "robotic" quality. Benchmark
score on a leaderboard is not a selection criterion by itself — it must
sound right in real Tanzanian Swahili sentences. ElevenLabs-level naturalness
is the *reference bar for quality*, not necessarily the chosen vendor —
evaluate it alongside open-source/local options and decide on quality +
privacy + cost + offline compatibility together. Do not over-process cloned
voice (no excessive compression, noise removal, or pitch normalization) —
natural imperfection often beats artificial cleanliness.

**Face and lip-sync.** The founder's face must stay identity-consistent
across outputs — no drift, no beautification filters, no plastic skin.
Lip-sync must be validated specifically against Swahili phonemes, not just
English (a model that syncs well in English can still fail on Swahili).
Movement should look like a real human on camera: natural blinking, eye
movement, head movement, breathing — under-animation beats exaggerated
animation.

**The single test that matters:** *"Would a normal Tanzanian viewer believe
a real Tanzanian creator recorded this?"* If no, the output is not
production-ready — identify which component failed (voice, pronunciation,
emotion, face, lip-sync, movement, lighting, script pacing) and fix that
component specifically.

**Required benchmark documents** (create once real models are being
evaluated, not during the mock phase):
- `TANZANIA_VOICE_BENCHMARK.md` — test sentences across categories: normal,
  excited, professional, mixed Swahili/English, storytelling, sales,
  educational. Score each candidate model 1-10 across pronunciation,
  naturalness, accent, emotion, emphasis, pauses, breathing, code-switching,
  realism, speed, VRAM, license, offline compatibility.
- `TANZANIA_LIPSYNC_BENCHMARK.md` — same discipline, specific to lip-sync
  accuracy on Swahili phonemes.

Do not ship a model into production because it was easy to integrate if it
fails this bar. Find a better one or adjust the pipeline instead.

---

## 5. USER-FACING FLOW (first UI)

Navigation: `Dashboard · Projects · Create Video · Assets · Models · Settings`

**Create Video**, four steps:

1. **Script** — text area, optional `.txt/.docx/.md` upload.
2. **Voice** — select founder voice; emotion picker (Neutral, Friendly,
   Excited, Serious, Professional, Storytelling) — mark any emotion option
   as experimental if the selected engine cannot actually control it
   reliably; never fake a control the model doesn't support.
3. **Avatar** — founder avatar, green-screen background, 1080x1920, 9:16.
4. **Generate** — shows live stage progress (see job states, §7), then a
   preview, download link, and generation details (duration, resolution,
   provider/model used).

---

## 6. TECHNICAL STACK (recommended, confirm before Phase 2)

Given the founder already runs NyumbaFasta on **Next.js 14 (App Router) +
TypeScript + Supabase**, reuse that stack here to avoid a second toolchain:

- **App/web layer:** Next.js 14 (App Router), TypeScript, run locally
  (`npm run dev`/`npm run start`) — no deployment target needed for a
  single user. Revisit only if the founder later wants phone/LAN access.
- **DB + Storage:** Supabase (Postgres + Storage) still makes sense even
  local-only — it can run against the hosted free tier (private project,
  never linked publicly) or via local Supabase CLI/Docker if the founder
  wants zero cloud dependency. Either way: no multi-user Auth complexity,
  just projects/jobs/assets tables (§6 schema, minus `users` role logic).
- **GPU worker:** a separate, portable **Python** service — this is where
  actual TTS/voice-cloning/lip-sync/video libraries run. It is intentionally
  decoupled from the Next.js app; it only needs to satisfy the
  `GPUProvider` contract (accept a job, return an asset). This same Python
  code is what moves from Colab -> Kaggle -> local GPU later with minimal
  change.
- **Job queue:** start as simple as possible — a `generation_jobs` table in
  Supabase with a status column, polled by the worker. Do not introduce
  Redis/RabbitMQ/etc. until the simple version demonstrably can't keep up.

### Minimal schema (do not expand without reason)
`projects · generation_jobs · assets · voices · avatars · providers · settings`
(no `users` table — single-user, no role logic to store)

Every table must have a clear reason to exist. Do not pre-build tables for
future features.

---

## 7. GENERATION PIPELINE AND JOB SYSTEM

Orchestrator stages (each stage independently retryable — a failure at
stage 4 retries stage 4 with the existing outputs of stages 1-3, it does
not restart the whole job):

```
1. Validate script       5. Lip-sync
2. Create job             6. Render green-screen video
3. Generate audio         7. Validate output
4. Generate avatar/face   8. Store output -> mark job COMPLETED
```

Job states: `QUEUED -> PROCESSING -> VOICE_GENERATING -> AVATAR_GENERATING ->
LIP_SYNC -> RENDERING -> COMPLETED / FAILED / CANCELLED`

Frontend polls or subscribes to job status; generation must never depend on
a single long-lived HTTP request staying open.

**Storage layout** (predictable, per project, never expose raw filesystem
paths to the client):
```
/projects/{projectId}/script/  /audio/  /avatar/  /lip-sync/  /output/
```

**Logging:** for every generation, record project id, job id, provider,
model, stage, start/end time, duration, and error if any. Never log
secrets, passwords, tokens, or unnecessary personal data.

---

## 8. TRAINING STUDIO — building the real Voice/Face providers

This section is the detailed mechanism behind Phase 3-5 (§9). It only
starts once the mock pipeline (Phase 2) is fully working end-to-end.

### 8.1 Principle: don't train if you don't have to
Before training or fine-tuning anything, ask: *can an existing open model,
driven by reference conditioning (a short voice sample, a reference photo),
already hit the Tanzania quality bar (§4)?* If yes, use conditioning —
it's cheaper, faster, and easier to iterate. Only move to fine-tuning /
LoRA / adapters / full training if conditioning demonstrably can't reach
the bar, and explain why before doing it.

### 8.2 Founder recordings -> profiles
The founder uploads multiple authorized videos (topic doesn't matter —
business, marketing, storytelling, general conversation — variety helps
capture natural range). Only videos the founder explicitly marks **"Add to
Training Dataset"** become training data — uploading a video elsewhere in
the app must never silently feed the training set.

Ingestion pipeline (fully automatic, no manual per-video processing):
```
Video -> Extract Audio -> Extract Frames -> Detect Face -> Detect Speech
-> Transcribe -> Align Audio+Text -> Analyze Voice -> Analyze Face
-> Analyze Speaking Style -> Add to Training Dataset
```

Each video gets a **quality score** before acceptance (resolution, frame
rate, audio quality/noise, lighting, face visibility/angle, speech clarity,
duration, compression artifacts) with a clear status: `GOOD FOR TRAINING`,
`NEEDS BETTER AUDIO`, `FACE NOT CLEAR ENOUGH`, `TOO MUCH BACKGROUND NOISE`.
Keep raw recordings and processed/cleaned data in separate storage — never
silently discard originals.

### 8.3 Four profiles, built independently
- **Voice profile** — pitch, tone, accent, pronunciation, speaking rate,
  pauses, rhythm, emphasis, breathing, emotional variation. Must
  specifically preserve **Tanzanian Swahili pronunciation** — do not let
  the pipeline normalize toward an American, British, or generic African
  accent.
- **Speaking style profile** (distinct from voice) — sentence length,
  speaking speed, pause frequency, emphasis patterns, intro/CTA style,
  storytelling pattern. Long-term goal: `new script + speaking style profile
  -> founder-like delivery`, even for text the founder never actually said.
- **Face identity profile** — structure, proportions, skin, eyes, mouth,
  nose, hair — must stay recognizable and consistent; explicitly avoid
  beautification filters, plastic smoothing, or identity drift.
- **Facial performance profile** — separate from identity: blinking,
  smiling, eyebrow movement, head/eye movement, subtle expressions, timing.
  Prefer learning from real reference video over static photos when it
  measurably improves realism (§4) — test both, keep whichever wins.

### 8.4 Progressive levels — build incrementally, never all at once
```
L1 Voice only -> L2 Face only -> L3 Voice+Face -> L4 Speaking style
-> L5 Performance -> L6 Full personalized digital twin
```
Architect for all six from day one, but only implement what's needed for
the current phase.

### 8.5 Training jobs, versioning, evaluation
Training reuses the job-state pattern from §7 (`UPLOADING -> VALIDATING ->
PREPROCESSING -> TRANSCRIBING -> EXTRACTING_AUDIO -> EXTRACTING_FRAMES ->
BUILDING_DATASET -> TRAINING -> EVALUATING -> COMPLETED/FAILED`).

Never overwrite a working model. Keep versions (`Founder Voice v1, v2, v3`
etc.) with metadata: type, base model, training dataset version, date, GPU
used, config, evaluation score, license, status. Dataset versions are kept
the same way, so it's possible to tell whether more data actually helped
or hurt (§8.6).

Model status flow: `EXPERIMENTAL -> APPROVED -> PRODUCTION`, with `REJECTED`
and `ARCHIVED` as terminal states. **Training completing successfully is
not the same as the output being good** — every trained model must pass
the §4 quality bar before it can become PRODUCTION, and the founder is the
final human approver. Before promotion, generate test outputs from fixed
Tanzanian Swahili test scripts (educational, business, excited,
storytelling, CTA, mixed-language) and support side-by-side A/B comparison
of versions.

### 8.6 Don't overtrain
More data is not automatically better. Watch for overfitting, pronunciation
degradation, lost naturalness, voice/identity artifacts, and repetitive
expressions. If a smaller dataset scores better on the §4 bar, keep the
smaller dataset. Quality beats dataset size.

### 8.7 Privacy for training data
Raw recordings, processed data, and all derived profiles/models are
private by default — encrypted/authenticated storage, role-based access,
secure deletion, version management. STAFF do not get automatic access to
raw training data or master model files, even if they can trigger
generation using the production model.

---

## 9. HARDWARE AND GPU STRATEGY

Current reality: the founder's development machine (Codespace / low-power
laptop) has **no GPU**. This is fine for Phase 1-2 — mocks need no GPU at
all. From Phase 3 onward, real model inference and training need GPU
compute, provided through `GPUProvider`:

```
Now:      Codespace (dev, CPU-only) -> GitHub repo -> Colab (free/Pro GPU)
Later:    same repo -> Kaggle (if more free weekly GPU hours are needed)
Future:   same repo -> local NVIDIA GPU machine (LAN-only, fully offline)
```

Document every model's deployment requirements in `MODEL_DEPLOYMENT.md`:
format, dependencies, Python version, CUDA version, minimum VRAM, exact
inference command, training config. This is what makes the cloud -> local
migration mechanical instead of a rewrite.

---

## 10. SECURITY

No secrets in source code, ever — env vars only, `.env.example` committed,
`.env` never committed. No private voice/face/video asset in a public
repo. No provider endpoint exposed without authentication. No model file
publicly downloadable. Least-privilege access throughout (§3).

---

## 11. REQUIRED PROJECT DOCUMENTS

Maintain these at the repo root; update them as decisions are made, not
after the fact:

`README.md · ARCHITECTURE.md · SETUP.md · DEVELOPMENT.md ·
MODEL_EVALUATION.md · TANZANIA_VOICE_BENCHMARK.md ·
TANZANIA_LIPSYNC_BENCHMARK.md · MODEL_DEPLOYMENT.md · SECURITY.md ·
ROADMAP.md · DECISIONS.md · FUTURE_FEATURES.md`

Every non-trivial architectural decision gets an entry in `DECISIONS.md`
in this shape:
```
Decision: <what was decided>
Reason:   <why, what alternative was rejected and why>
```

---

## 12. BUILD PHASES

**Phase 1 — Architecture.** Inspect any existing code, identify stack and
risks, write `ARCHITECTURE.md / ROADMAP.md / DECISIONS.md /
FUTURE_FEATURES.md / SECURITY.md`, propose folder structure. No feature
code yet.

**Phase 2 — Mock skeleton.** Simple local password gate (not full auth),
dashboard, projects, create-video page, job system, all provider
interfaces, **mock** implementations of Voice/Face/LipSync, storage
interface, basic MP4 pipeline, installable PWA shell. Success criterion:
script in -> mock voice -> mock avatar -> mock lip-sync -> green screen -> MP4
out, fully working locally, zero GPU required.

**Phase 3 — Real Voice.** Evaluate candidates against §4 and
`MODEL_EVALUATION.md` criteria (quality, speed, VRAM, license, local
compatibility). Select, integrate behind `VoiceProvider`. This is also
where §8 (Training Studio) work on the voice profile becomes real.

**Phase 4 — Real Face/Avatar.** Same discipline, behind `FaceProvider` /
`AvatarProvider`, feeding from §8's face identity + performance profiles.

**Phase 5 — Real Lip-Sync.** Same discipline, behind `LipSyncProvider`,
validated specifically against Swahili phonemes (§4).

**Phase 6 — Quality improvement.** Only after 3-5 work end-to-end: emotion
control, natural pauses, pronunciation fixes, speaking-rate control, better
rendering, background-removal quality, optional captions.

Do not start Phase 3 until Phase 2's mock pipeline runs cleanly end-to-end
and is tested.

---

## 13. TESTING

Minimum: auth/access tests, project-creation tests, job-creation tests,
provider-interface tests, pipeline tests, storage tests, authorization
tests. All of this must be runnable with **mock** providers so the full
system is verifiable without a GPU or without downloading large models.

---

## 14. FIRST TASK FOR CLAUDE CODE

Do not build the full system immediately. In order:

1. Inspect the current repository state.
2. Identify existing stack/assets and risks.
3. Recommend the architecture and the simplest viable tech choices (confirm
   or challenge §6's stack suggestion here).
4. Explicitly recommend what should **not** be built yet, and what should
   be postponed to `FUTURE_FEATURES.md`.
5. Create the Phase 1 documents (§11 subset relevant to architecture).
6. Build the Phase 2 mock skeleton.
7. Make the full mock pipeline work end-to-end.
8. Run tests; fix failures.
9. Report back in exactly this shape:

```
## IMPLEMENTED
## NOT IMPLEMENTED
## DECISIONS
## RISKS
## NEXT STEP   (the single most important next action)
```

---

## 15. FINAL SUCCESS CRITERION

The system succeeds when this loop works end-to-end:

```
Founder uploads authorized videos -> system builds voice/face/style profiles
-> founder writes a new Tanzanian Swahili script -> system generates
founder-like voice -> founder-like facial performance -> accurate lip-sync
-> realistic green-screen MP4 -> founder downloads it -> finishes in CapCut
```

...and a Tanzanian viewer's honest reaction is **"Huyu ni yeye anaongea"**
— not "hii ni AI avatar." Every technical decision in this document is in
service of that one sentence. Optimize for identity, voice, language,
style, performance, and realism — not for generation speed, feature count,
or technical impressiveness.
