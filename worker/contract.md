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
  "stage": "training",       // while running, for long tasks (train)
  "error": "...",            // when status=error
  "artifactUrl": "/artifacts/<id>",  // when done AND a binary artifact exists
  "mime": "audio/wav" | "image/png" | "video/mp4",
  "kind": "MOCK" | "EXPERIMENTAL" | "PRODUCTION",
  "model": "mock-tone-v1",
  "meta": { ... },
  "result": { ... }          // when done, for tasks that return JSON not bytes
}
```

### `GET /artifacts/{id}`
Raw bytes of the produced file, `Content-Type` = the `mime` above.

---

## Training tasks (Training Studio, brief §8)

`WorkerTrainingProvider` (`src/lib/training/worker-provider.ts`) uses the same
`/run` → `/jobs/{id}` → `/artifacts/{id}` flow. `type` is one of:

### `ingest`
`payload` = `{ "filename": str, "mime": str, "fileB64": str }` (the app sends the
uploaded recording base64-encoded).
`result` = `{ "qualityScore": 1..10, "qualityStatus": str, "meta": {...} }`

### `build_dataset`
`payload` = `{ "videos": [{ "id", "meta", "quality_status" }, ...] }`
`result` = `{ "clipCount", "speechSeconds", "frameCount", "faceOkRatio" }`

### `train`  (long — the app polls for up to ~1h)
`payload` = `{ "profile", "level", "datasetId", "datasetStats": {...}, "baseModel" }`
Reports progress via `stage` on `/jobs/{id}` (`preprocessing` → `transcribing` →
`building_dataset` → `training` → `evaluating`).
`result` = `{ "baseModel", "evalScore", "evalBreakdown": {metric: score},
             "gpuUsed", "license", "kind" }`

### `evaluate`
`payload` = `{ "profile", "versionId", "testKey", "scriptText" }`
Returns BOTH a `result` (`{ "scores": {metric: score}, "kind" }`) and a binary
`artifactUrl` (the preview wav/png the app stores under `training/evals/`).

Phase 3+ (see MODEL_DEPLOYMENT.md):
- Python version, CUDA version, minimum VRAM per task type
- exact model weights + license, cold-start + warm inference time
- how the worker is exposed (cloudflared / ngrok / LAN) and pointed at from
  Settings → Compute

## Migration notes (fill in during Phase 3, see MODEL_DEPLOYMENT.md)

- Python version, CUDA version, minimum VRAM per task type
- exact model weights + license
- cold-start time, warm inference time
- how the notebook is exposed (ngrok / cloudflared / LAN)
