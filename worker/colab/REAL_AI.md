# Real AI from the app UI — how it fits together

**Status: EXPERIMENTAL, untested. Voice only (Phase 3 / L1).**

The app never runs models itself (no GPU, brief §2.2 / §9). Real work happens on
a **worker** you run wherever you have a GPU; the app drives it over HTTP and you
point it there in **Settings → Compute**.

```
  your browser ──► app (local / Codespace) ──HTTP──► gpu_worker.py (Colab / Kaggle / local NVIDIA)
                     │                                   whisper + piper fine-tune + piper synth
                     ▼
                 storage/ (raw videos, datasets, model versions, eval previews)
```

## One-time setup

1. Run **`gpu_worker.ipynb`** on Colab (`Runtime → Run all`). It prints a
   `https://…trycloudflare.com` URL (and a token, if you enabled one).
2. App → **Settings → Compute**: paste the URL + token, **Test connection**,
   set GPU provider = `http`, Training provider = `worker`, **Save**.
   (No restart — it takes effect on the next job.)

## The loop

| Step | Where | What really happens |
|---|---|---|
| Upload videos | Training → Videos | stored in `storage/raw/`; worker extracts audio, runs **Whisper (sw)**, scores quality |
| Mark "Add to dataset" | Training → Videos | your explicit choice — nothing trains without it (§8.2) |
| Build dataset | Training → Datasets | worker assembles an LJSpeech dataset from the transcribed clips |
| **Train** (voice) | Training → Jobs | worker runs a **Piper fine-tune** from a base checkpoint → `<modelRef>.onnx`. Minutes → ~1h (`PIPER_EPOCHS`). |
| Evaluate | automatic after train | worker synthesises the 6 fixed Swahili scripts with the new model |
| Listen + Promote | Training → Models | you judge against the Tanzania bar (§4); **Promote to PRODUCTION** |
| Create Video | Create Video | your script synthesises with the PRODUCTION voice model |

Improvements are **saved as versions** — v1, v2, … never overwritten. A/B compare
them on the Models page.

## What is NOT real yet

- **Face / lip-sync**: `gpu_worker.py` still mocks these (Phase 4/5). A generated
  video has your real *voice* over a mock face + mock lip-sync until then.
- **Quality**: no open model has passed the Tanzania bar for Tanzanian Swahili
  yet. The Piper fine-tune is unproven — the first results may be flat/robotic.
  If so we escalate to an XTTS / F5 fine-tune (needs a bigger GPU box).
- **`evalScore`** from the worker is a rough proxy (from usable speech minutes).
  The real judgement is you listening to the eval clips.

## Getting videos to the worker

The app sends each uploaded recording to the worker itself (base64 over the
tunnel). If the app runs in your Codespace, that hop is cloud-to-cloud and fast —
your slow connection only has to get the video into the app once (or via a Drive
link on the Videos page if that's added later).
