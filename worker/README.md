# worker/

The decoupled compute service (brief §6, §9). Phase 2 = a **mock** reference
implementation of [`contract.md`](./contract.md); no GPU, stdlib only.

## Why it exists now

So the `GPUProvider` HTTP seam that Phase 3 depends on is real and tested against
a concrete implementation, not invented later. The Phase 2 app does **not**
require it — the default `GPU_PROVIDER=local-mock` runs the same mock generation
in-process.

## Run the mock worker

```bash
python3 worker/worker.py            # listens on :8800
```

Point the app at it:

```bash
# .env
GPU_PROVIDER=http
GPU_WORKER_URL=http://localhost:8800
# GPU_WORKER_TOKEN=optional
```

## Phase 3+ path

Colab / Kaggle / local NVIDIA. Replace the `_gen_voice / _gen_face / _gen_lipsync`
functions with real models, keep the HTTP surface, expose the notebook over
cloudflared/ngrok/LAN, and document format + deps + CUDA + VRAM + exact commands
in [`../MODEL_DEPLOYMENT.md`](../MODEL_DEPLOYMENT.md).
