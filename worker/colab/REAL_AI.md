# Real AI from the app UI — how it fits together

**Status: EXPERIMENTAL, untested. Voice + Face + Lip-sync — all from the same
uploaded videos.**

The app never runs models itself (no GPU, brief §2.2 / §9). Real work happens on
a **worker** you run wherever you have a GPU; the app drives it over HTTP and you
point it there in **Settings → Compute**.

```
  your browser ──► app (local / Codespace) ──HTTP──► gpu_worker.py (Colab / Kaggle / local NVIDIA)
                     │                                   whisper + F5-TTS fine-tune/synth + SadTalker/LivePortrait
                     ▼
                 storage/ (raw videos, datasets, model versions, eval previews)
```

## One-time setup

Same `gpu_worker.py` runs on three interchangeable backends — pick whichever
has GPU access right now:

1. Run the worker notebook/script: `worker/colab/gpu_worker.ipynb` (Colab),
   `worker/kaggle/gpu_worker.ipynb` (Kaggle), or `worker/local/start.sh`
   (your own NVIDIA GPU via WSL2 — see `worker/local/README.md`). It prints
   a `https://…trycloudflare.com` URL and a bearer token.
2. App → **Settings → Compute profiles**: pick the matching card (Colab /
   Kaggle / Local), paste the URL + token, **Hifadhi**, then **Washa** —
   this switches GPU provider = `http` and Training provider = `worker` in
   one click. Switching backends later (e.g. Colab hits its GPU-hours
   limit) is just picking a different saved profile — no re-pasting.

## The loop

| Step | Where | What really happens |
|---|---|---|
| Upload videos | Training → Videos | stored in `storage/raw/`; worker extracts audio, runs **Whisper (sw)**, scores quality |
| Mark "Add to dataset" | Training → Videos | your explicit choice — nothing trains without it (§8.2) |
| Build dataset | Training → Datasets | worker assembles an LJSpeech dataset from the transcribed clips |
| **Train** — one job per profile, all from the same videos: |||
| &nbsp;&nbsp;`voice` | Training → Jobs | **F5-TTS fine-tune** → `ckpts/<modelRef>/model_last.pt` (minutes → ~1h) |
| &nbsp;&nbsp;`face_identity` | Training → Jobs | scans your video, picks the **best real front-facing reference frame** (+ alternates), scores identity consistency. NOT a cartoon — a frame of you. |
| &nbsp;&nbsp;`face_performance` | Training → Jobs | pulls a short natural talking clip (blinks, head motion) for expression transfer |
| &nbsp;&nbsp;`lipsync` | Training → Jobs | prepares your face for the talking-head model (SadTalker / LivePortrait) |
| &nbsp;&nbsp;`speaking_style` | Training → Jobs | analyzes your own transcripts (sentence length, wpm, opener/closer phrasing) — no GPU/neural model, brief §8.3. Applied automatically to new scripts once promoted. |
| Evaluate | automatic after each train | voice → 6 synthesised Swahili clips; face → the reference frame; performance/lipsync → a short **talking-head video** on the fixed scripts |
| Watch + Promote | Training → Models | judge each against §4; **Promote to PRODUCTION** |
| Create Video | Create Video | your voice + your face + real lip-sync |

Improvements are **saved as versions** — v1, v2, … never overwritten. A/B compare
them on the Models page.

## What is NOT real / not guaranteed

- **Face "training" is not a fine-tune.** SadTalker / LivePortrait are
  inference-time animators: `face_identity` training = *selecting the best
  reference from your video*; the animation happens at generate time.
- **Photorealism depends on the GPU.** Free-tier T4 → decent but not
  indistinguishable. "A viewer can't tell it's AI" (§4/§15) is the bar to
  iterate toward, not a first-run guarantee. Ceiling models (Hallo2 / EMO) need
  an A100-class GPU.
- **Quality unproven.** No open model has passed the Tanzania bar for Tanzanian
  Swahili voice yet (MMS zero-shot failed §4; F5-TTS zero-shot voice was
  close but Swahili pronunciation was weak; F5-TTS fine-tune is the current
  bet — first full run hasn't completed yet, blocked on reliable GPU access).
- **`evalScore`** from the worker is a rough proxy. The real judgement is you
  watching / listening to the eval clips on the Models page.
- **`speaking_style`** is rule-based statistics (sentence length, pace,
  opener/closer phrasing), not a generative rewrite — deliberately kept
  simple (no paid LLM API wired in); "new script -> founder-like delivery"
  means reshaped sentence rhythm, not AI-generated new wording.

## Getting videos to the worker

The app sends each uploaded recording to the worker itself (base64 over the
tunnel). If the app runs in your Codespace, that hop is cloud-to-cloud and fast —
your slow connection only has to get the video into the app once (or via a Drive
link on the Videos page if that's added later).
