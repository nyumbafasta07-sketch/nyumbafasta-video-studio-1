# Colab notebooks — Phase 3+ (EXPERIMENTAL, untested)

All three are **self-contained**: they write their own code with `%%writefile`,
no git clone, no Google Drive. Open a link, `Runtime → Change runtime type →
T4 GPU`, then `Runtime → Run all`. Re-open from the link after any repo update
(Colab does not auto-pull).

Base URL: `https://colab.research.google.com/github/nyumbafasta07-sketch/nyumbafasta-video-studio-1/blob/phase-2-mock-skeleton/worker/colab/`

| Order | Notebook | Does | Needs |
|---|---|---|---|
| — | `voice_benchmark.ipynb` | score candidate engines (MMS-TTS swh baseline, Chatterbox timbre) against `../../TANZANIA_VOICE_BENCHMARK.md` | one voice reference clip |
| 1 | `ingest.ipynb` | authorized videos → `dataset/` (clips + Whisper `sw` transcripts + quality score + face crops), brief §8.2 | 4–8 videos, ~20–40 min speech total |
| 2 | `finetune_piper.ipynb` | `dataset_v1.zip` → **Founder Voice v1** (Piper fine-tune) → synth the 27 benchmark sentences | output of step 1 |

## Getting media in without Google Drive

The `files.upload()` widget is unreliable (it often hangs without opening), so
the notebooks don't use it. Instead:

- **File panel** (main way): click the **folder icon** on the left sidebar,
  **drag your files into the list**, wait for the upload circles to finish, then
  run the "get your files" cell — it moves them into place. Re-drag + re-run if
  the runtime disconnects.
- **`gdown` from a Drive share link** (`ingest.ipynb` cell 4a-alt): server-side,
  fast, no mount. Right-click the file in Drive → Share → Anyone with the link.
- **`wget` from a private/expiring direct link** (`ingest.ipynb` cell 4c;
  `finetune_piper.ipynb` cell 3).

Colab's file-panel upload is still slow for big files, so shrink them first on
your own machine:

```
# 480p + small audio — plenty for ingestion, ~10x smaller
ffmpeg -i INPUT.mp4 -vf scale=-2:480 -c:v libx264 -crf 30 -c:a aac -b:a 96k SMALL.mp4

# or audio only (then add a few face photos in cell 4b)
ffmpeg -i INPUT.mp4 -vn -c:a aac -b:a 96k CLIP.m4a
```

Cell 4c can also `wget` a video from a private/expiring direct link (Dropbox
`?dl=1`, etc.) — faster and resumable.

## Files here

- `voice_worker.py` — voice backends (mms / chatterbox / xtts) + `worker/contract.md` HTTP serve mode
- `ingest.py` — the §8.2 ingestion pipeline
- `benchmark_sentences.json` — the 27 test sentences (machine copy of `../../TANZANIA_VOICE_BENCHMARK.md`)
- `pronunciation_fixes.json` — MMS per-word respelling band-aid
- `*.ipynb` — the notebooks above (generated; each embeds the relevant `.py`)
