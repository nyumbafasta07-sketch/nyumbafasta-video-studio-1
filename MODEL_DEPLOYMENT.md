# MODEL_DEPLOYMENT

Status: **PLACEHOLDER — Phase 3+.** What makes the cloud → local migration
mechanical instead of a rewrite (brief §9). One section per real model, filled in
when it is integrated.

## Phase 3 voice candidates — measured values TBD

Run `worker/colab/voice_worker.py` (see `worker/colab/RUN_ON_COLAB.md`), then
fill the blanks from what you actually observe. Do not copy vendor claims.

### Coqui XTTS v2 — voice (zero-shot clone)
- Implements interface: `VoiceProvider` (via `GPU_PROVIDER=http`)
- Provider name (env): `xtts`  (worker `--backend xtts`)
- Weights / source: `tts_models/multilingual/multi-dataset/xtts_v2` (coqui-tts)
- Licence: **Coqui Public Model Licence — verify commercial terms before shipping**
- Format: Coqui TTS checkpoint     Python: 3.10+   CUDA: ____   Torch: ____
- Minimum VRAM: ____ (T4 16 GB expected to be enough)
- Reference clip: one ~10–20s mono wav of the founder
- Swahili: **not an official language**; worker forces `language="sw"` — record
  whether pronunciation/accent passes §4 or fails (expected risk)
- Cold start: ____   Warm inference: ____ s per sentence
- Exact command: `python voice_worker.py --mode serve --backend xtts --ref REF.wav --port 8800`
- Worker exposure: cloudflared tunnel (Colab) / LAN host:port (local)
- Notes / gotchas:

### Meta MMS-TTS (swh) — voice (single-speaker BASELINE, not a clone)
- Purpose: accent/pronunciation reference to score cloners against — NOT a
  founder-voice candidate
- Source: `facebook/mms-tts-swh` (transformers `VitsModel`)
- Licence: CC-BY-NC 4.0 (non-commercial — baseline use only)
- Python: 3.10+   Torch: ____   VRAM: small
- Exact command: `python voice_worker.py --mode benchmark --backend mms --out ./out`

---

## Template (copy per model)

```
### <model name> — <voice | face | lipsync>
- Implements interface: <VoiceProvider | FaceProvider | LipSyncProvider>
- Provider name (env): <NAME>            e.g. VOICE_PROVIDER=<name>
- Weights / source: <url or hub id>       License: <...>
- Format: <safetensors | ckpt | onnx ...>
- Python: <x.y>   CUDA: <x.y>   Torch: <x.y>
- Minimum VRAM: <GB>   Recommended: <GB>
- Dependencies: <pinned list or requirements file>
- Cold start: <s>   Warm inference: <s per unit>
- Exact inference command / entrypoint:
    <command>
- Training config (if fine-tuned): <path, dataset version, GPU, hyperparams>
- Worker exposure: <cloudflared | ngrok | LAN host:port>
- Notes / gotchas:
```

## Environments (brief §9)

```
Now:    Codespace (CPU only) — mocks
Phase3: Colab (free/Pro GPU)  — same repo, worker/ implements the real models
Later:  Kaggle (more weekly GPU hours)
Future: local NVIDIA box (LAN-only, fully offline) — only GPUProvider=http target changes
```
