# MODEL_EVALUATION

Criteria are fixed now; scoring tables get filled in when candidates are
actually tested. A high aggregate never overrides a failure on the Tanzania bar
(`ENGINEERING_BRIEF.md` §4) — that is a gate.

## Selection criteria (every model, every phase)

| Criterion | Notes |
|---|---|
| Tanzania quality bar | GATE. "Would a normal Tanzanian viewer believe a real Tanzanian creator recorded this?" |
| Output quality | naturalness / identity consistency / lip-sync accuracy per component |
| Swahili correctness | Tanzanian pronunciation, rhythm, code-switching (voice); Swahili phonemes (lip-sync) |
| Speed | cold start + warm inference per unit of output |
| VRAM | minimum to run; fits the target GPU tier (Colab T4/L4 ≈ 15–24 GB) |
| Licence | must permit private commercial use; note any restriction |
| Local compatibility | can it run fully offline on a local NVIDIA box later? |
| Integration cost | one-off; never a reason to ship a model that fails the bar |

---

## Phase 3 — Voice: candidates to test

None of these officially target **Tanzanian** Swahili, so all must be run
through `TANZANIA_VOICE_BENCHMARK.md` before any judgement. Listed as starting
points, not a recommendation.

| Candidate | Type | Licence (verify at test time) | Why it's on the list | Main risk |
|---|---|---|---|---|
| **Coqui XTTS v2** | zero-shot multilingual voice clone, ~6s reference | Coqui Public Model Licence (non-commercial clauses — **check carefully**) | best-known open multilingual cloner; handles unseen languages zero-shot | licence may block commercial use; Coqui is defunct (no upstream fixes); Swahili not trained |
| **OpenVoice v2** (MyShell) | tone-colour clone on top of a base speaker | MIT | permissive licence; separates timbre from base voice | base speakers don't include Swahili — accent/pronunciation likely wrong |
| **Fish Speech / OpenAudio S1** | zero-shot multilingual clone | mixed across versions — some CC-BY-NC-SA, newer tiers commercial — **verify** | strong recent multilingual naturalness | licence tier confusion; VRAM |
| **F5-TTS** | zero-shot clone (flow-matching) | permissive (MIT-style) | high naturalness, active project | trained mostly EN/ZH; Swahili is out-of-distribution |
| **Meta MMS-TTS (`swh`)** | single-speaker Swahili TTS | CC-BY-NC 4.0 | actually has a Swahili model | **not** a cloner; single fixed voice; robotic; NC licence |
| **Piper (Swahili voices)** | fast lightweight single-speaker | MIT | runs on CPU; genuinely has Swahili voices | not the founder's voice; flatter prosody |
| **ElevenLabs** | hosted, multilingual, supports Swahili | commercial SaaS | the §4 *reference bar* for naturalness | cloud (privacy), paid, not offline — evaluate for comparison, not as default |

### Likely order of testing
1. XTTS v2 and F5-TTS for zero-shot **conditioning** quality (brief §8.1 — try
   conditioning before any training).
2. If pronunciation/accent fails: check whether a short LoRA / fine-tune on the
   founder's recordings fixes Tanzanian pronunciation (brief §8.5) — smallest
   dataset that passes wins (§8.6).
3. Keep MMS-TTS / Piper Swahili as a robotic baseline to score against.
4. Score ElevenLabs on the same sentences as the quality ceiling reference.

### Results so far (2026-09, Colab T4)

| Model | Ran? | Founder verdict | §4 verdict |
|---|---|---|---|
| XTTS v2 (coqui-tts) | **no** — install broke on Colab (numpy/torch/transformers); no Swahili anyway | — | not tested; deprioritised for Colab |
| Chatterbox (MIT) | timbre check only (English) | pending | n/a (English-only, timbre reference) |
| **MMS-TTS swh** | yes | "matamshi sio nzuri lakini yapo; kidogo robotic; baadhi ya maneno lafudhi ya Kimarekani" | **FAIL** — robotic + accent drift + not the founder's voice |
| F5-TTS / OpenVoice / Fish | not yet | — | — |
| ElevenLabs (reference) | not yet | — | — |

**Decision:** zero-shot conditioning (MMS/XTTS/Chatterbox) does not reach §4 for
Tanzanian Swahili in the founder's voice → move to a **fine-tune** on his
recordings (brief §8.1 threshold met). Band-aids applied to MMS
(`MMS_RATE`, `pronunciation_fixes.json`) are cosmetic and don't change this.

### Fine-tune plan (Phase 3, next)

1. `worker/colab/ingest.py` builds the dataset from authorized recordings
   (audio → silence-split → Whisper `sw` transcribe → quality score) — DONE.
2. Fine-tune candidate order (smallest/most-offline first, brief §8.6):
   - **VITS fine-tune of MMS-TTS swh** — already speaks Swahili; adapt toward
     the founder's voice + nudge accent. `finetune-hf-vits` recipe.
   - **Piper fine-tune** from a Swahili checkpoint — MIT, fast, low VRAM,
     designed for exactly this; flatter prosody is the risk.
   - **XTTS v2 fine-tune** (local box only, given Colab install pain) — best
     prosody, heaviest, licence to re-check.
3. Evaluate every fine-tune against the 27 `TANZANIA_VOICE_BENCHMARK.md`
   sentences; keep the smallest dataset / model that passes §4 (§8.6).

---

## Phase 4 — Face/Avatar candidates

Fed by `ingest.py` face crops + (later) a facial-performance profile from the
reference videos (brief §8.3). Candidates to test — all need the §4 identity bar
(no drift, no beautification, no plastic skin):

| Candidate | Type | Licence (verify) | Why | Risk |
|---|---|---|---|---|
| **SadTalker** | audio + 1 photo → talking head | Apache-2.0 | well-known, runs on Colab, low input needs | limited head motion, can look stiff |
| **Hallo2 / Hallo** | audio-driven portrait animation | check (research licence) | more natural motion than SadTalker | VRAM, longer runtime |
| **EMO / EchoMimic / AniPortrait** | diffusion audio→video | mixed | higher realism | heavy, slow, VRAM |
| **LivePortrait** | reference-video-driven reenactment | MIT | excellent identity retention, expression transfer from a driving video (matches §8.3 "learn from real reference video") | needs a driving performance clip, not just audio |
| **Real3D-Portrait / GAGAvatar** | one-shot 3D head avatar | research | consistent identity across angles | setup complexity |

Likely order: SadTalker (baseline, cheap) → LivePortrait (identity + real
performance transfer) → a diffusion model only if those miss §4.

## Phase 5 — Lip-sync candidates

## Phase 5 — Lip-sync candidates

_(to be filled in Phase 5 — must be validated on Swahili phonemes, see
`TANZANIA_LIPSYNC_BENCHMARK.md`)_

---

## Decision log

Each selection also gets a `DECISIONS.md` entry with the rejected alternatives.
