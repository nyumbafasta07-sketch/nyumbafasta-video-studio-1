# ROADMAP

Derived from `ENGINEERING_BRIEF.md` §12. Each phase is gated: do not start the
next until the current one runs cleanly end-to-end and is tested.

---

## Phase 1 — Architecture  ✅ (this pass)

- [x] Inspect repo, identify stack + risks
- [x] Recommend / challenge the tech stack (see `DECISIONS.md`)
- [x] Write `ARCHITECTURE.md`, `ROADMAP.md`, `DECISIONS.md`,
      `FUTURE_FEATURES.md`, `SECURITY.md`
- [x] Propose folder structure

## Phase 2 — Mock skeleton  ✅ (built + tested 2026-09-10)

Success criterion **met**: script in -> mock voice -> mock avatar -> mock
lip-sync -> green screen -> MP4 out, fully working locally, zero GPU.
`npm test` 29/29 · `next build` compiles · live curl smoke verified.

- [x] Local password gate (middleware + signed cookie, no auth lib)
- [x] SQLite schema + repo layer (7 tables, no `users`)
- [x] Provider interfaces: Script, Voice, Face, LipSync, Renderer, Storage, GPU
- [x] Mock implementations of Voice / Face / LipSync / Script
- [x] StorageProvider (local filesystem, per-project layout)
- [x] 8-stage orchestrator with per-stage retry + job state machine
- [x] `ffmpeg-static` MP4 render (1080x1920, 9:16, green screen)
- [x] UI: Dashboard, Projects, Create Video (4 steps), job progress, download
- [x] Installable PWA shell (manifest + service worker)
- [x] Python worker skeleton (`worker/`) — contract reference, not required
- [x] Tests: auth, projects, jobs, provider interface, pipeline, storage
- [x] Founder confirmed SQLite (not Supabase) — `DECISIONS.md`, 2026-09-10

## Phase 3 — Real Voice  ← CURRENT

Cannot proceed on autopilot. Needs from the founder: authorized voice
recordings, a GPU path (Colab first), and final approval of a model after it
passes the Tanzania bar (§4).

- [x] `MODEL_EVALUATION.md` criteria + candidate shortlist (GPU-free prep)
- [x] `TANZANIA_VOICE_BENCHMARK.md` — test sentences + 1-10 scoring grid
- [ ] Founder provides authorized voice recordings (see brief §8.2)
- [ ] Founder picks the GPU path (Colab free/Pro) and shares access
- [ ] Run each shortlisted model on the benchmark sentences; score against §4
- [ ] Stand up the `http` GPUProvider against Colab; document in `MODEL_DEPLOYMENT.md`
- [ ] Integrate winner behind `VoiceProvider`; keep mock as fallback
- [ ] Training Studio: voice profile ingestion (brief §8) — only if conditioning
      can't hit the bar

## Phase 4 — Real Face / Avatar

- [ ] Same discipline behind `FaceProvider` / `AvatarProvider`
- [ ] Face identity profile + facial performance profile (brief §8.3)
- [ ] Identity-consistency checks: no drift, no beautification

## Phase 5 — Real Lip-Sync

- [ ] `TANZANIA_LIPSYNC_BENCHMARK.md` — Swahili-phoneme-specific scoring
- [ ] Integrate behind `LipSyncProvider`, validated on Swahili phonemes

## Phase 6 — Quality improvement

- [ ] Emotion control (only expose controls the engine really supports)
- [ ] Natural pauses, pronunciation fixes, speaking-rate control
- [ ] Better rendering, background-removal quality, optional captions

---

## Final success criterion (brief §15)

Founder uploads authorized videos -> profiles built -> new Swahili script ->
founder-like voice + face + lip-sync -> realistic green-screen MP4 -> finish in
CapCut -> a Tanzanian viewer says **"Huyu ni yeye anaongea"**, not "hii ni AI
avatar."
