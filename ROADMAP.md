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
`npm test` 33/33 · `next build` compiles · live curl smoke verified.

- [x] Local password gate (middleware + signed cookie, no auth lib)
- [x] SQLite schema + repo layer (7 tables, no `users`)
- [x] Provider interfaces: Script, Voice, Face, LipSync, Renderer, Storage, GPU
- [x] Mock implementations of Voice / Face / LipSync / Script
- [x] StorageProvider (local filesystem, per-project layout)
- [x] 8-stage orchestrator with per-stage retry + job state machine
- [x] `ffmpeg-static` MP4 render (1080x1920, 9:16, green screen)
- [x] UI: Dashboard, Projects, Create Video (4 steps), job progress, download
- [x] Script step: `.txt` / `.md` / `.docx` upload (`/api/script/extract`, mammoth)
- [x] Job lifecycle: Cancel (any running stage) + Retry (FAILED/CANCELLED, resumes)
- [x] Installable PWA shell — manifest, service worker, real 192/512 icons
- [x] Python worker skeleton (`worker/`) — contract reference, not required
- [x] Tests: auth, authz, projects, jobs, job-actions, providers, pipeline, storage
- [x] Founder confirmed SQLite (not Supabase) — `DECISIONS.md`, 2026-09-10

Phase 2 is feature-complete for the brief's §5 / §7 / §12 scope.

## Phase 3 — Real Voice  ← CURRENT

Cannot proceed on autopilot. Needs from the founder: a working GPU connection
(see "Current blocker" below) and final approval of a model after it passes
the Tanzania bar (§4). Recordings are no longer the blocker — see below.

- [x] `MODEL_EVALUATION.md` criteria + candidate shortlist
- [x] `TANZANIA_VOICE_BENCHMARK.md` — 27 test sentences + scoring grid
- [x] Colab benchmarked conditioning candidates against §4:
      - XTTS v2 / coqui-tts — install too brittle on Colab; no Swahili anyway
      - Chatterbox (MIT) — English-only, install broke same-runtime as F5-TTS
      - **MMS-TTS (swh)** — runs; founder verdict: FAILS §4 (slightly robotic,
        accent drifts American on some words). Band-aids added (slower rate,
        `pronunciation_fixes.json`) — cosmetic only.
      - **F5-TTS zero-shot** — voice similarity good, Swahili pronunciation
        weak (base model is EN/ZH-trained) — confirmed fine-tuning is needed,
        not just conditioning.
- [x] Conclusion: zero-shot conditioning can't hit §4 → fine-tune is justified
      (brief §8.1)
- [x] `worker/colab/ingest.py` + `ingest.ipynb` — §8.2 ingestion (audio →
      silence-split → Whisper transcribe → quality score + face crops)
- [x] **Founder's authorized recordings gathered and ingested** (4 videos,
      2026-09) — DONE, no longer a blocker.
- [x] **Piper abandoned** — `piper-phonemize` has zero PyPI wheels for
      Python 3.13, unfixable via pinning. `worker/colab/finetune_piper.ipynb`
      is dead; voice training moved to **F5-TTS** (MIT code / CC-BY-NC
      weights, real fine-tuning support, actively maintained).
- [x] **Training Studio in the app UI** (§8, branch `training-studio`) —
      `/training`: upload videos + mark "Add to Training Dataset" + quality
      scores; dataset versions; training jobs (staged, cancellable);
      model_versions with EXPERIMENTAL→APPROVED→PRODUCTION; fixed-script
      evaluation + A/B compare. All 5 profiles scaffolded (voice,
      speaking_style, face_identity, face_performance, lipsync).
- [x] **Real GPU worker** — `worker/colab/gpu_worker.py`: real `ingest`
      (Whisper sw) / `build_dataset` / `train` (F5-TTS fine-tune for voice,
      real frame/driving-clip extraction for face) / `evaluate` / `voice`
      synth / `lipsync` (SadTalker / LivePortrait). Also ported to
      `worker/kaggle/` and `worker/local/` (WSL2) — same fixed code, three
      interchangeable compute backends via Settings → Compute profiles
      (one-button switch, no re-pasting URL/token).
- [x] Found-and-fixed live-run bugs (all fixed at the code level, so none are
      Colab-specific): mediapipe API removal → OpenCV Haar cascade; an
      OpenCV dual-install conflict from SadTalker's deps → forced single
      clean install; F5-TTS's own training script spawning 16 dataloader
      workers → OOM'd the whole worker (fixed: custom driver, 2 workers);
      unbounded subprocess output buffering → OOM'd the worker a second way
      (fixed: log to file); `face_performance` trained separately from
      `face_identity`/`lipsync` never reached generation (fixed: `perfRef`
      wiring).
- [x] Deep security audit + Semgrep activated (`npm run security-scan`) —
      found and fixed one real issue (open-redirect/XSS via login's `?next=`
      param); everything else investigated was confirmed not exploitable.
- [x] App plumbing: `datasets.worker_ref`, version `config.modelRef`,
      voice/face/lipsync generation use the PRODUCTION model's `modelRef`
      when on a real worker, falling back to mock otherwise.
- [ ] **Current blocker: reliable GPU access.** Colab hit its free-tier
      usage limit; Kaggle is blocked by a known, unresolved Kaggle-side bug
      (phone verification fails even after selfie verification succeeds —
      not fixable by us). `worker/local/` (WSL2 on the founder's own NVIDIA
      GPU) is built and ready but not yet run by the founder — this is the
      most promising near-term path since it has no session limits or quota.
- [ ] First real F5-TTS training run to actually complete (previous attempt
      crashed from the now-fixed OOM bug) — re-run once a GPU connection is
      stable, judge Founder Voice v1 against §4.

## Phase 4 — Real Face / Avatar

Fed by the same ingestion (`ingest.py` already saves face crops). Blocked on
the same GPU access issue as Phase 3 (code is ready to test, not recordings).

- [x] Face-crop extraction + quality flags in `ingest.py` (found ratio, face
      fraction, sharpness → `FACE NOT CLEAR ENOUGH` / `FACE BLURRY`)
- [x] Phase 4 candidate research in `MODEL_EVALUATION.md`
- [x] Real `FaceProvider` wiring: `face_identity` training scans source
      video frames, scores by centred-ness + sharpness, saves the best real
      reference frame (not a cartoon) + identity-consistency proxy
- [x] Face performance profile: extracts a short driving clip for expression
      transfer; correctly reaches generation even when trained separately
      from `face_identity` (`perfRef` wiring, 2026-09)
- [x] Identity-consistency checks: histogram-correlation proxy across scored
      frames (no drift, no beautification — real pixels from the founder's
      own video)
- [ ] Live-tested since the OpenCV fix (mediapipe's API was removed
      upstream; switched to OpenCV Haar cascade) — blocked on GPU access

## Phase 5 — Real Lip-Sync

- [x] `TANZANIA_LIPSYNC_BENCHMARK.md` — 22 phoneme-targeted Swahili lines + grid
- [x] Phase 5 candidate research in `MODEL_EVALUATION.md` (Wav2Lip, LatentSync,
      MuseTalk, LivePortrait)
- [x] Integrated behind `LipSyncProvider`: SadTalker (audio-driven, default)
      or LivePortrait (video-driven, needs a driving clip) — switchable via
      `FACE_MODEL` env var on the worker
- [ ] Never actually run against a live GPU yet — SadTalker/LivePortrait
      inference is completely untested in practice, not just unvalidated on
      Swahili phonemes specifically

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
