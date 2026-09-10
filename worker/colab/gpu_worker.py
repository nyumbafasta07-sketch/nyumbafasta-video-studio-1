#!/usr/bin/env python3
"""
REAL GPU worker — voice only (Phase 3 / L1). EXPERIMENTAL, untested.

Implements worker/contract.md (generation + training) with real models:
  ingest        -> ffmpeg + faster-whisper (Swahili) -> clips + transcripts
  build_dataset -> assemble an LJSpeech dataset from ingested clips
  train         -> Piper fine-tune (profile=voice only) -> <modelRef>.onnx
  evaluate      -> Piper synth of a fixed script -> wav preview
  voice         -> Piper synth with the PRODUCTION model (modelRef)
  face/lipsync  -> still MOCK here (real ones are Phase 4/5)

The app (Training Studio + Settings -> Compute) drives this over HTTP. Point
GPU_WORKER_URL at wherever this runs (Colab tunnel, Kaggle, a local NVIDIA box).

State lives under WORK_DIR (default /content/vs-work):
  videos/<sha1>/    per-recording clips + metadata      (from ingest)
  datasets/<ref>/   assembled LJSpeech dataset           (from build_dataset)
  models/<ref>.onnx trained voices                       (from train)

Run:  python gpu_worker.py            (listens on :8800)
Env:  WORK_DIR, GPU_WORKER_TOKEN, PORT, FFMPEG, WHISPER_SIZE (default small)
"""
from __future__ import annotations

import base64
import hashlib
import json
import math
import os
import pathlib
import struct
import subprocess
import threading
import time
import uuid
import wave
import zlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import ingest as ing  # sibling: extract_audio, silence_windows, cut, transcribe, mean_volume_db

WORK = pathlib.Path(os.environ.get("WORK_DIR", "/content/vs-work"))
TOKEN = os.environ.get("GPU_WORKER_TOKEN", "")
PORT = int(os.environ.get("PORT", "8800"))
WHISPER = os.environ.get("WHISPER_SIZE", "small")
PIPER_BASE = os.environ.get(
    "PIPER_BASE_CKPT",
    "https://huggingface.co/datasets/rhasspy/piper-checkpoints/resolve/main/"
    "en/en_US/lessac/medium/epoch%3D2164-step%3D1355540.ckpt",
)

JOBS: dict[str, dict] = {}
LOCK = threading.Lock()
for sub in ("videos", "datasets", "models", "tmp"):
    (WORK / sub).mkdir(parents=True, exist_ok=True)


# --------------------------------------------------------------------------- #
#  ingest                                                                    #
# --------------------------------------------------------------------------- #

def do_ingest(payload: dict, _set_stage=None):
    b64 = payload.get("fileB64")
    if not b64:
        raise ValueError("ingest needs fileB64")
    raw = base64.b64decode(b64)
    ref = hashlib.sha1(raw).hexdigest()[:16]
    vdir = WORK / "videos" / ref
    if (vdir / "metadata.csv").exists():
        meta = json.loads((vdir / "meta.json").read_text())
        return {"result": {"qualityScore": meta["qualityScore"],
                           "qualityStatus": meta["qualityStatus"], "meta": meta}}, None, None
    vdir.mkdir(parents=True, exist_ok=True)
    src = vdir / ("src" + pathlib.Path(payload.get("filename", "v.mp4")).suffix)
    src.write_bytes(raw)

    (vdir / "wavs").mkdir(exist_ok=True)
    full = vdir / "audio.wav"
    ing.extract_audio(src, full)
    vol = ing.mean_volume_db(full)
    spans = ing.silence_windows(full)

    rows, speech = [], 0.0
    for i, (s, e) in enumerate(spans):
        cid = f"{ref}_{i:04d}"
        clip = vdir / "wavs" / f"{cid}.wav"
        ing.cut(full, s, e, clip)
        text, conf = ing.transcribe(clip, WHISPER, payload.get("lang", "sw"))
        if len(text) < 3 or conf < -1.2:
            clip.unlink(missing_ok=True)
            continue
        rows.append(f"{cid}|{text}")
        speech += e - s
    (vdir / "metadata.csv").write_text("\n".join(rows) + "\n", encoding="utf-8")

    score = 10
    status = "GOOD FOR TRAINING"
    if vol < -34:
        score -= 3; status = "TOO MUCH BACKGROUND NOISE"
    if speech < 60:
        score -= 3; status = "NEEDS MORE SPEECH"
    score = max(1, score)
    meta = {"workerRef": ref, "qualityScore": score, "qualityStatus": status,
            "clips": len(rows), "speech_seconds": round(speech),
            "est_speech_seconds": round(speech), "mean_volume_db": round(vol, 1)}
    (vdir / "meta.json").write_text(json.dumps(meta))
    return {"result": {"qualityScore": score, "qualityStatus": status, "meta": meta}}, None, None


# --------------------------------------------------------------------------- #
#  build_dataset                                                             #
# --------------------------------------------------------------------------- #

def do_build_dataset(payload: dict, _set_stage=None):
    refs = sorted(
        str((v.get("meta") or {}).get("workerRef", "")) for v in payload.get("videos", [])
    )
    refs = [r for r in refs if r]
    if not refs:
        raise ValueError("no ingested videos (missing workerRef) — re-run ingest against this worker")
    dref = hashlib.sha1("|".join(refs).encode()).hexdigest()[:16]
    ddir = WORK / "datasets" / dref
    (ddir / "wavs").mkdir(parents=True, exist_ok=True)

    rows, speech = [], 0.0
    for r in refs:
        vdir = WORK / "videos" / r
        if not (vdir / "metadata.csv").exists():
            continue
        for line in (vdir / "metadata.csv").read_text(encoding="utf-8").splitlines():
            if "|" not in line:
                continue
            cid, text = line.split("|", 1)
            wav = vdir / "wavs" / f"{cid}.wav"
            if not wav.exists():
                continue
            dst = ddir / "wavs" / f"{cid}.wav"
            if not dst.exists():
                dst.write_bytes(wav.read_bytes())
            rows.append(f"{cid}|{text}")
            speech += _wav_seconds(dst)
    (ddir / "metadata.csv").write_text("\n".join(rows) + "\n", encoding="utf-8")
    return {"result": {"clipCount": len(rows), "speechSeconds": round(speech),
                       "frameCount": 0, "faceOkRatio": 0, "workerRef": dref}}, None, None


def _wav_seconds(p: pathlib.Path) -> float:
    try:
        with wave.open(str(p), "rb") as w:
            return w.getnframes() / float(w.getframerate())
    except Exception:
        return 0.0


# --------------------------------------------------------------------------- #
#  train  (Piper fine-tune, voice only)                                      #
# --------------------------------------------------------------------------- #

def do_train(payload: dict, set_stage=None):
    if payload.get("profile") != "voice":
        raise ValueError(f"gpu_worker only trains 'voice'; got {payload.get('profile')!r} "
                         "(face / speaking_style / face_performance are Phase 4-6)")
    dref = str(payload.get("datasetRef") or "")
    ddir = WORK / "datasets" / dref
    if not (ddir / "metadata.csv").exists():
        raise ValueError("dataset not on this worker — rebuild the dataset against this worker")

    model_ref = f"voice-{dref[:8]}-{int(time.time())}"
    out_ckpt_dir = WORK / "tmp" / model_ref
    out_ckpt_dir.mkdir(parents=True, exist_ok=True)

    if set_stage:
        set_stage("preprocessing")
    subprocess.run(
        ["python", "-m", "piper_train.preprocess", "--language", "sw",
         "--input-dir", str(ddir), "--output-dir", str(out_ckpt_dir),
         "--dataset-format", "ljspeech", "--single-speaker", "--sample-rate", "22050"],
        check=True, capture_output=True,
    )

    if set_stage:
        set_stage("training")
    base = WORK / "tmp" / "piper_base.ckpt"
    if not base.exists():
        subprocess.run(["wget", "-q", "-O", str(base), PIPER_BASE], check=True)
    epochs = int(os.environ.get("PIPER_EPOCHS", "2000"))
    subprocess.run(
        ["python", "-m", "piper_train", "--dataset-dir", str(out_ckpt_dir),
         "--accelerator", "gpu", "--devices", "1", "--batch-size", "16",
         "--validation-split", "0.0", "--num-test-examples", "0",
         "--max_epochs", str(epochs), "--resume_from_checkpoint", str(base),
         "--checkpoint-epochs", "250", "--precision", "32"],
        check=True, capture_output=True,
    )

    if set_stage:
        set_stage("evaluating")
    import glob
    ckpts = sorted(glob.glob(str(out_ckpt_dir / "lightning_logs/version_*/checkpoints/*.ckpt")))
    onnx = WORK / "models" / f"{model_ref}.onnx"
    subprocess.run(["python", "-m", "piper_train.export_onnx", ckpts[-1], str(onnx)],
                   check=True, capture_output=True)
    (WORK / "models" / f"{model_ref}.onnx.json").write_bytes((out_ckpt_dir / "config.json").read_bytes())

    mins = float(payload.get("datasetStats", {}).get("speechSeconds", 0)) / 60
    proxy = max(1.0, min(9.0, round(8.4 * (1 - math.exp(-mins / 12)), 1)))
    return {"result": {"baseModel": "piper/en_US-lessac-medium (cross-lang FT)",
                       "modelRef": model_ref, "evalScore": proxy,
                       "evalBreakdown": {"note_human_eval_required": proxy},
                       "gpuUsed": _gpu_name(), "license": "MIT (Piper)",
                       "kind": "EXPERIMENTAL"}}, None, None


def _gpu_name() -> str:
    try:
        out = subprocess.run(["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"],
                             capture_output=True, text=True).stdout.strip()
        return out or "gpu"
    except Exception:
        return "gpu"


# --------------------------------------------------------------------------- #
#  evaluate / voice  (Piper synth)                                           #
# --------------------------------------------------------------------------- #

def _piper_synth(model_ref: str, text: str) -> bytes:
    onnx = WORK / "models" / f"{model_ref}.onnx"
    if not onnx.exists():
        raise ValueError(f"model {model_ref} not found on this worker")
    out = WORK / "tmp" / f"{uuid.uuid4().hex}.wav"
    subprocess.run(["piper", "-m", str(onnx), "-f", str(out)],
                   input=text.encode(), check=True, capture_output=True)
    data = out.read_bytes()
    out.unlink(missing_ok=True)
    return data


def do_evaluate(payload: dict, _set_stage=None):
    if payload.get("profile") != "voice":
        # non-voice profiles: no real model — return a placeholder tone so the UI
        # has something, clearly EXPERIMENTAL
        data = _mock_wav(3.0, 6)
        return {"result": {"scores": {}, "note": "no real model for this profile yet",
                           "kind": "EXPERIMENTAL"}}, data, "audio/wav"
    data = _piper_synth(str(payload.get("modelRef") or ""), str(payload.get("scriptText", "")))
    return {"result": {"scores": {}, "note": "listen and score against the Tanzania bar (§4)",
                       "kind": "EXPERIMENTAL"}}, data, "audio/wav"


def do_voice(payload: dict, _set_stage=None):
    ref = str(payload.get("modelRef") or "")
    if not ref:
        raise ValueError("no PRODUCTION voice model — train one in the Training Studio and "
                         "promote it, or switch GPU provider back to local-mock")
    data = _piper_synth(ref, str(payload.get("text", "")))
    return data, "audio/wav", {"modelRef": ref}


# --------------------------------------------------------------------------- #
#  face / lipsync  — still MOCK here (Phase 4/5)                             #
# --------------------------------------------------------------------------- #

def _mock_wav(seconds: float, words: int) -> bytes:
    sr = 22050
    n = int(max(0.5, seconds) * sr)
    spw = max(1, n // max(1, words))
    pcm = bytearray()
    for i in range(n):
        wp = (i % spw) / spw
        env = 0.5 - 0.5 * math.cos((wp / 0.8) * 2 * math.pi) if wp < 0.8 else 0.0
        s = math.sin(2 * math.pi * 130 * i / sr) * env * 0.28
        pcm += struct.pack("<h", max(-32768, min(32767, int(s * 32767))))
    buf = WORK / "tmp" / f"{uuid.uuid4().hex}.wav"
    with wave.open(str(buf), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes(bytes(pcm))
    data = buf.read_bytes(); buf.unlink(missing_ok=True)
    return data


def do_face(payload: dict, _set_stage=None):
    w = int(payload.get("width", 720)); h = int(payload.get("height", 900))
    png = _mock_png(w, h)
    return png, "image/png", {"width": w, "height": h, "mock": True}


def _mock_png(w: int, h: int) -> bytes:
    def chunk(t, d):
        return (struct.pack(">I", len(d)) + t + d +
                struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF))
    stride = w * 3
    raw = bytearray()
    for _ in range(h):
        raw.append(0)
        raw += bytes((150, 110, 84)) * w
    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(bytes(raw)))
            + chunk(b"IEND", b""))


def do_lipsync(payload: dict, _set_stage=None):
    face_b64 = payload.get("faceB64"); audio_b64 = payload.get("audioB64")
    if not face_b64 or not audio_b64:
        raise ValueError("lipsync needs faceB64 + audioB64")
    w = int(payload.get("width", 720)); h = int(payload.get("height", 900))
    fp = WORK / "tmp" / f"{uuid.uuid4().hex}.png"; fp.write_bytes(base64.b64decode(face_b64))
    ap = WORK / "tmp" / f"{uuid.uuid4().hex}.wav"; ap.write_bytes(base64.b64decode(audio_b64))
    op = WORK / "tmp" / f"{uuid.uuid4().hex}.mp4"
    ff = os.environ.get("FFMPEG", "ffmpeg")
    vf = (f"scale={w}:{h},drawbox=x={round(w/2-w*0.12)}:y={round(h*0.72)}:"
          f"w={round(w*0.24)}:h='{round(h*0.09)}*abs(sin(2*PI*t*3))':color=black@0.85:t=fill,"
          f"format=yuv420p")
    subprocess.run([ff, "-hide_banner", "-y", "-loop", "1", "-i", str(fp), "-i", str(ap),
                    "-shortest", "-vf", vf, "-r", "25", "-c:v", "libx264", "-preset", "ultrafast",
                    "-tune", "stillimage", "-c:a", "aac", "-pix_fmt", "yuv420p", str(op)],
                   check=True, capture_output=True)
    data = op.read_bytes()
    for p in (fp, ap, op):
        p.unlink(missing_ok=True)
    return data, "video/mp4", {"width": w, "height": h, "mock_lipbar": True}


# --------------------------------------------------------------------------- #
#  dispatch + http                                                           #
# --------------------------------------------------------------------------- #

BINARY = {"voice": do_voice, "face": do_face, "lipsync": do_lipsync}
JSON_TASKS = {"ingest": do_ingest, "build_dataset": do_build_dataset,
              "train": do_train, "evaluate": do_evaluate}


def _process(job_id: str, task: dict) -> None:
    with LOCK:
        JOBS[job_id]["status"] = "running"
    ttype = task.get("type")
    payload = task.get("payload", {})

    def set_stage(s):
        with LOCK:
            JOBS[job_id]["stage"] = s

    try:
        if ttype in BINARY:
            data, mime, meta = BINARY[ttype](payload)
            with LOCK:
                JOBS[job_id].update(status="done", artifact=data, mime=mime,
                                    kind="EXPERIMENTAL", model=f"gpu-{ttype}", meta=meta)
            return
        body, data, mime = JSON_TASKS[ttype](payload, set_stage)
        with LOCK:
            JOBS[job_id].update(status="done", result=body.get("result", {}),
                                artifact=data, mime=mime, kind="EXPERIMENTAL",
                                model=f"gpu-{ttype}")
    except subprocess.CalledProcessError as exc:  # noqa: BLE001
        tail = (exc.stderr or b"")[-1500:].decode(errors="replace") if isinstance(exc.stderr, bytes) else str(exc.stderr)
        with LOCK:
            JOBS[job_id].update(status="error", error=f"{exc}\n{tail}")
    except Exception as exc:  # noqa: BLE001
        with LOCK:
            JOBS[job_id].update(status="error", error=str(exc))


class H(BaseHTTPRequestHandler):
    def _auth(self):
        return not TOKEN or self.headers.get("Authorization") == f"Bearer {TOKEN}"

    def _j(self, code, body):
        b = json.dumps(body).encode()
        self.send_response(code); self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)

    def log_message(self, *_):
        pass

    def do_GET(self):  # noqa: N802
        if self.path == "/health":
            return self._j(200, {"ok": True, "impl": "gpu_worker", "gpu": _gpu_name()})
        if not self._auth():
            return self._j(401, {"error": "unauthorized"})
        if self.path.startswith("/jobs/"):
            with LOCK:
                job = JOBS.get(self.path.split("/", 2)[2])
            if not job:
                return self._j(404, {"error": "no such job"})
            if job["status"] == "done":
                r = {"status": "done", "kind": job.get("kind"), "model": job.get("model"),
                     "meta": job.get("meta", {})}
                if job.get("artifact") is not None:
                    r["artifactUrl"] = f"/artifacts/{self.path.split('/',2)[2]}"
                    r["mime"] = job.get("mime")
                if "result" in job:
                    r["result"] = job["result"]
                return self._j(200, r)
            if job["status"] == "error":
                return self._j(200, {"status": "error", "error": job.get("error", "")})
            return self._j(200, {"status": job["status"], "stage": job.get("stage", "")})
        if self.path.startswith("/artifacts/"):
            with LOCK:
                job = JOBS.get(self.path.split("/", 2)[2])
            if not job or job.get("status") != "done" or job.get("artifact") is None:
                return self._j(404, {"error": "not ready"})
            self.send_response(200); self.send_header("Content-Type", job["mime"])
            self.send_header("Content-Length", str(len(job["artifact"]))); self.end_headers()
            self.wfile.write(job["artifact"]); return
        return self._j(404, {"error": "not found"})

    def do_POST(self):  # noqa: N802
        if not self._auth():
            return self._j(401, {"error": "unauthorized"})
        if self.path != "/run":
            return self._j(404, {"error": "not found"})
        n = int(self.headers.get("Content-Length", "0"))
        task = json.loads(self.rfile.read(n) or b"{}")
        if task.get("type") not in BINARY and task.get("type") not in JSON_TASKS:
            return self._j(400, {"error": f"unknown task {task.get('type')!r}"})
        jid = uuid.uuid4().hex
        with LOCK:
            JOBS[jid] = {"status": "queued"}
        threading.Thread(target=_process, args=(jid, task), daemon=True).start()
        return self._j(202, {"jobId": jid})


if __name__ == "__main__":
    print(f"[gpu_worker] :{PORT}  WORK={WORK}  gpu={_gpu_name()}  auth={'on' if TOKEN else 'off'}")
    ThreadingHTTPServer(("0.0.0.0", PORT), H).serve_forever()
