# Run the voice benchmark on Colab

**Status: EXPERIMENTAL, untested.** This is the Phase 3 starting point — get
candidate voices onto the `TANZANIA_VOICE_BENCHMARK.md` sentences so a Tanzanian
listener can score them against the §4 bar. Nothing here is production.

## What you need first

1. **A reference clip of your voice** — one clean ~10–20 second `.wav`, mono,
   little background noise, just you speaking normally. (For `xtts`.)
2. A Google account (Colab free tier gives a T4 GPU, enough for this).

## Steps

Open a new Colab notebook (`Runtime → Change runtime type → T4 GPU`) and run
these cells.

### 1. Get the code

```python
!git clone https://github.com/nyumbafasta07-sketch/nyumbafasta-video-studio-1 repo
%cd repo/worker/colab
```

(or upload `voice_worker.py` + `benchmark_sentences.json` with the file panel)

### 2. Install a backend

```python
# XTTS v2 — clones your voice. Swahili is not officially supported; you judge it.
!pip -q install coqui-tts
```

```python
# MMS-TTS (swh) — real Swahili, fixed speaker, no cloning. The accent baseline.
!pip -q install "transformers>=4.44" torch
```

### 3. Upload your reference clip (xtts only)

```python
from google.colab import files
up = files.upload()            # pick your ref .wav
ref = next(iter(up))
```

### 4. Generate the benchmark

```python
# your voice, questionable Swahili:
!python voice_worker.py --mode benchmark --backend xtts --ref "$ref" --out ./out

# correct-ish Swahili, not your voice (baseline to compare against):
!python voice_worker.py --mode benchmark --backend mms --out ./out
```

Outputs land in `out/xtts/` and `out/mms/` as `A1_normal.wav`, `B4_excited.wav`,
… plus `_results.json` (which sentences errored).

### 5. Listen and score

```python
import IPython.display as ipd, glob
for f in sorted(glob.glob("out/xtts/*.wav")):
    print(f); ipd.display(ipd.Audio(f))
```

Score each against the grid in `TANZANIA_VOICE_BENCHMARK.md`. Fill the table in
`MODEL_EVALUATION.md`. Write down **which specific thing** fails (accent drift?
"ng'ombe" wrong? rushed pacing? robotic?) — that decides the next move
(different model, or a small fine-tune on your recordings per brief §8).

## Optional: plug it into the app live

```python
!pip -q install cloudflared || (curl -L -o /usr/local/bin/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 && chmod +x /usr/local/bin/cloudflared)
```

```python
import subprocess, threading
threading.Thread(target=lambda: subprocess.run(
    ["python","voice_worker.py","--mode","serve","--backend","xtts","--ref",ref,"--port","8800"]
), daemon=True).start()
!cloudflared tunnel --url http://localhost:8800
```

Take the `https://xxxx.trycloudflare.com` URL it prints, then on your machine:

```
# .env
GPU_PROVIDER=http
GPU_WORKER_URL=https://xxxx.trycloudflare.com
```

Now `Generate video` in the app uses the real voice. Everything downstream
(avatar, lip-sync, render) is still mock until Phases 4–5. Record real
Python/CUDA/VRAM/timing numbers in `MODEL_DEPLOYMENT.md`.
