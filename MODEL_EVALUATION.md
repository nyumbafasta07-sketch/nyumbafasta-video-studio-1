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

### Scoring table (fill in during testing)

| Model | Pron. (TZ) | Accent | Natural | Pacing | Pauses | Emphasis | Breath | Code-switch | Emotion | Realism | Speed | VRAM | Licence OK | Offline | §4 verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| XTTS v2 | | | | | | | | | | | | | | | |
| F5-TTS | | | | | | | | | | | | | | | |
| OpenVoice v2 | | | | | | | | | | | | | | | |
| Fish/OpenAudio S1 | | | | | | | | | | | | | | | |
| MMS-TTS swh (baseline) | | | | | | | | | | | | | | | |
| ElevenLabs (reference) | | | | | | | | | | | | | | | |

---

## Phase 4 — Face/Avatar candidates

_(to be filled in Phase 4)_

## Phase 5 — Lip-sync candidates

_(to be filled in Phase 5 — must be validated on Swahili phonemes, see
`TANZANIA_LIPSYNC_BENCHMARK.md`)_

---

## Decision log

Each selection also gets a `DECISIONS.md` entry with the rejected alternatives.
