# Colab notebooks — Phase 3+ (EXPERIMENTAL)

All notebooks here are **self-contained**: they write their own code with
`%%writefile`, no git clone, no Google Drive. Open a link, `Runtime → Change
runtime type → T4 GPU`, then run cells in order (not always safe to
"Run all" — some notebooks pause for you to drag a file in first). Re-open
from the link after any repo update (Colab does not auto-pull).

Base URL: `https://colab.research.google.com/github/nyumbafasta07-sketch/nyumbafasta-video-studio-1/blob/training-studio/worker/colab/`

| Notebook | Does | Driven by |
|---|---|---|
| **`gpu_worker.ipynb`** | the real worker — ingest, dataset build, F5-TTS voice fine-tune, face profile extraction, SadTalker/LivePortrait talking-head | the app's **Training Studio** + **Create Video** over HTTP (see `REAL_AI.md`) — this is the one you normally run |
| `voice_benchmark.ipynb` | quick zero-shot voice-cloning check (MMS-TTS / F5-TTS / Chatterbox) against `../../TANZANIA_VOICE_BENCHMARK.md`, without committing to a full fine-tune | manual, one reference clip |
| `ingest.ipynb` | standalone version of the ingestion step `gpu_worker.py` also does internally — useful for inspecting a dataset directly | manual |

Not on Colab: `worker/kaggle/gpu_worker.ipynb` (same worker, Kaggle's
Internet/Accelerator toggles instead) and `worker/local/` (your own NVIDIA
GPU via WSL2, no notebook at all — see `worker/local/README.md`). Switch
between all three from the app's **Settings → Compute profiles** with no
re-pasting once each is saved.

`finetune_piper.ipynb` is **dead** — Piper is an unfixable dead end
(`piper-phonemize` has no PyPI wheels for current Python). Voice fine-tuning
now happens inside `gpu_worker.ipynb`/`gpu_worker.py` via F5-TTS.

## Getting media in without Google Drive

The `files.upload()` widget is unreliable (it often hangs without opening),
so the notebooks that need a manual file (mainly `voice_benchmark.ipynb`)
don't use it. Instead:

- **File panel** (main way): click the **folder icon** on the left sidebar,
  **drag your files into the list**, wait for the upload circles to finish,
  then run the "get your files" cell — it moves them into place. Re-drag +
  re-run if the runtime disconnects.
- **`gdown` from a Drive share link**: server-side, fast, no mount.
  Right-click the file in Drive → Share → Anyone with the link.
- **`wget` from a private/expiring direct link**.

`gpu_worker.ipynb` itself needs no manual file upload — videos go from the
app to the worker over HTTP (base64), driven by Training Studio.

Colab's file-panel upload is still slow for big files, so shrink them first
on your own machine:

```
# 480p + small audio — plenty for ingestion, ~10x smaller
ffmpeg -i INPUT.mp4 -vf scale=-2:480 -c:v libx264 -crf 30 -c:a aac -b:a 96k SMALL.mp4

# or audio only (then add a few face photos separately)
ffmpeg -i INPUT.mp4 -vn -c:a aac -b:a 96k CLIP.m4a
```

## Files here

- `gpu_worker.py` — the real worker (imported/embedded by `gpu_worker.ipynb`)
- `f5_finetune_driver.py` — Colab-safe copy of F5-TTS's own finetune script
  (adds `--num_workers`, since the stock script's hardcoded 16 OOMs free Colab)
- `ingest.py` — the §8.2 ingestion pipeline (imported by `gpu_worker.py`)
- `voice_worker.py` — zero-shot voice backends (mms / f5tts / chatterbox) for `voice_benchmark.ipynb`
- `benchmark_sentences.json` — the 27 test sentences (machine copy of `../../TANZANIA_VOICE_BENCHMARK.md`)
- `pronunciation_fixes.json` — MMS per-word respelling band-aid
- `*.ipynb` — the notebooks above (generated; each embeds the relevant `.py`)
