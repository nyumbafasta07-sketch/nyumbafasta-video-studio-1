# MODEL_DEPLOYMENT

Status: **PLACEHOLDER — Phase 3+.** What makes the cloud → local migration
mechanical instead of a rewrite (brief §9). One section per real model, filled in
when it is integrated.

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
