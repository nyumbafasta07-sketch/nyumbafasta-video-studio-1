# GPU Worker Contract

The `http` GPUProvider (`src/lib/providers/gpu/http.ts`) speaks this HTTP contract.
Any worker — Colab notebook, Kaggle kernel, local NVIDIA box — that implements it
is a drop-in compute backend (brief §2.3, §9). Phase 2 ships a **mock** reference
implementation in `worker.py`; Phase 3 replaces the mock generators with real
TTS / face / lip-sync while keeping these endpoints unchanged.

## Auth

If `GPU_WORKER_TOKEN` is set, every request carries `Authorization: Bearer <token>`.
The worker must reject mismatches with 401.

## Endpoints

### `GET /health`
`200 {"ok": true, "impl": "mock", "gpu": false}`

### `POST /run`
Body = a task:
```json
{
  "type": "voice" | "face" | "lipsync",
  "projectId": "proj_...",
  "jobId": "job_...",
  "payload": { ... }
}
```
`payload` per type:
- `voice`   → `{ "text": str, "voiceId": str, "emotion": str, "seconds"?: number }`
- `face`    → `{ "avatarId": str, "width": int, "height": int }`
- `lipsync` → `{ "faceB64": str (png), "audioB64": str (wav), "width": int, "height": int }`

Response: `202 {"jobId": "<worker-side id>"}`

> Note: for `lipsync` the app sends the face/audio bytes base64-encoded in the
> payload (the worker has no access to the app's storage). The local-mock
> provider passes file paths instead since it runs in-process.

### `GET /jobs/{workerJobId}`
```json
{
  "status": "queued" | "running" | "done" | "error",
  "error": "..."            // when status=error
  "artifactUrl": "/artifacts/<id>",  // when status=done
  "mime": "audio/wav" | "image/png" | "video/mp4",
  "kind": "MOCK" | "EXPERIMENTAL" | "PRODUCTION",
  "model": "mock-tone-v1",
  "meta": { ... }
}
```

### `GET /artifacts/{id}`
Raw bytes of the produced file, `Content-Type` = the `mime` above.

## Migration notes (fill in during Phase 3, see MODEL_DEPLOYMENT.md)

- Python version, CUDA version, minimum VRAM per task type
- exact model weights + license
- cold-start time, warm inference time
- how the notebook is exposed (ngrok / cloudflared / LAN)
