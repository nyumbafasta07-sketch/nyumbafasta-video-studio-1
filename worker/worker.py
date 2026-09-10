#!/usr/bin/env python3
"""
MOCK GPU worker — reference implementation of worker/contract.md.

Phase 2: produces deliberately fake artifacts with zero GPU, mirroring
src/lib/providers/gpu/local-mock.ts. Phase 3: swap the `_gen_*` functions for
real TTS / face / lip-sync models; the HTTP surface stays identical so the
Next.js app needs no change (brief Â§2.3, Â§9).

Run:  python3 worker/worker.py           (listens on :8800)
Env:  GPU_WORKER_TOKEN  optional bearer token
      PORT              default 8800
      FFMPEG            path to ffmpeg (default: "ffmpeg")

Stdlib only. No third-party deps for the mock. This is EXPERIMENTAL and is not
exercised by the Phase 2 test suite.
"""
import base64
import json
import math
import os
import struct
import subprocess
import tempfile
import threading
import time
import uuid
import wave
import zlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TOKEN = os.environ.get("GPU_WORKER_TOKEN", "")
PORT = int(os.environ.get("PORT", "8800"))
FFMPEG = os.environ.get("FFMPEG", "ffmpeg")

# workerJobId -> dict(status, artifact(bytes), mime, kind, model, meta, error)
JOBS: dict[str, dict] = {}
LOCK = threading.Lock()


# --------------------------- mock generators ---------------------------

def _gen_voice(payload: dict) -> tuple[bytes, str, dict]:
    text = str(payload.get("text", ""))
    words = max(1, len([w for w in text.split() if w]))
    seconds = float(payload.get("seconds") or max(1.0, words / 2.3))
    rate = 22050
    n = int(seconds * rate)
    spw = max(1, n // words)
    frames = bytearray()
    for i in range(n):
        wp = (i % spw) / spw
        env = 0.5 - 0.5 * math.cos((wp / 0.8) * 2 * math.pi) if wp < 0.8 else 0.0
        freq = 110 + 40 * math.sin(i / rate * 3)
        s = math.sin(2 * math.pi * freq * i / rate) * env * 0.28
        frames += struct.pack("<h", max(-32768, min(32767, int(s * 32767))))
    buf = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    with wave.open(buf.name, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(bytes(frames))
    data = open(buf.name, "rb").read()
    os.unlink(buf.name)
    return data, "audio/wav", {"seconds": seconds, "wordCount": words}


def _png_chunk(tag: bytes, data: bytes) -> bytes:
    return (
        struct.pack(">I", len(data))
        + tag
        + data
        + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    )


def _gen_face(payload: dict) -> tuple[bytes, str, dict]:
    w = int(payload.get("width", 720))
    h = int(payload.get("height", 900))
    bg = (24, 26, 32)
    skin = (150, 110, 84)
    cx, cy, rx, ry = w / 2, h * 0.46, w * 0.30, h * 0.34
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        for x in range(w):
            nx, ny = (x - cx) / rx, (y - cy) / ry
            raw += bytes(skin if nx * nx + ny * ny <= 1 else bg)
    png = b"\x89PNG\r\n\x1a\n"
    png += _png_chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
    png += _png_chunk(b"IDAT", zlib.compress(bytes(raw)))
    png += _png_chunk(b"IEND", b"")
    return png, "image/png", {"width": w, "height": h}


def _gen_lipsync(payload: dict) -> tuple[bytes, str, dict]:
    w = int(payload.get("width", 720))
    h = int(payload.get("height", 900))
    face_b64 = payload.get("faceB64")
    audio_b64 = payload.get("audioB64")
    if not face_b64 or not audio_b64:
        raise ValueError("lipsync needs faceB64 and audioB64")
    fd_face = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
    fd_face.write(base64.b64decode(face_b64))
    fd_face.close()
    fd_audio = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    fd_audio.write(base64.b64decode(audio_b64))
    fd_audio.close()
    out = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
    out.close()
    mouth_w = round(w * 0.24)
    mouth_h = round(h * 0.09)
    mouth_x = round(w / 2 - mouth_w / 2)
    mouth_y = round(h * 0.72)
    vf = (
        f"scale={w}:{h},"
        f"drawbox=x={mouth_x}:y={mouth_y}:w={mouth_w}:"
        f"h='{mouth_h}*abs(sin(2*PI*t*3))':color=black@0.85:t=fill,"
        f"crop={w}:{h}:0:'2*sin(2*PI*t*0.25)',format=yuv420p"
    )
    subprocess.run(
        [FFMPEG, "-hide_banner", "-y", "-loop", "1", "-i", fd_face.name,
         "-i", fd_audio.name, "-shortest", "-vf", vf, "-r", "25",
         "-c:v", "libx264", "-preset", "ultrafast", "-tune", "stillimage",
         "-c:a", "aac", "-b:a", "128k", "-pix_fmt", "yuv420p", out.name],
        check=True, capture_output=True,
    )
    data = open(out.name, "rb").read()
    for p in (fd_face.name, fd_audio.name, out.name):
        os.unlink(p)
    return data, "video/mp4", {"width": w, "height": h}


GENERATORS = {"voice": _gen_voice, "face": _gen_face, "lipsync": _gen_lipsync}
MODELS = {"voice": "mock-tone-v1", "face": "mock-portrait-v1", "lipsync": "mock-lipbar-v1"}


# --------------------------- training (mock, mirrors src/lib/training) --------

def _h(s: str) -> int:
    h = 2166136261
    for ch in s:
        h ^= ord(ch)
        h = (h * 16777619) & 0xFFFFFFFF
    return h


def _rand(seed: int):
    a = [seed & 0xFFFFFFFF]

    def nxt():
        a[0] = (a[0] + 0x6D2B79F5) & 0xFFFFFFFF
        t = a[0]
        t = (t ^ (t >> 15)) * (1 | t) & 0xFFFFFFFF
        t = (t + ((t ^ (t >> 7)) * (61 | t) & 0xFFFFFFFF)) & 0xFFFFFFFF ^ t
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296

    return nxt


def _c10(x: float) -> float:
    return max(1.0, min(10.0, round(x * 10) / 10))


VOICE_KEYS = ["pronunciation_tz", "accent_tz", "naturalness", "pacing", "pauses",
              "emphasis", "breathing", "code_switch", "realism"]
FACE_KEYS = ["identity", "no_drift", "skin_realism", "blinking", "head_motion", "realism"]
STYLE_KEYS = ["sentence_length", "pace", "pause_pattern", "emphasis_pattern", "cta_style"]


def _keys_for(profile: str):
    if profile == "voice":
        return VOICE_KEYS
    if profile == "speaking_style":
        return STYLE_KEYS
    return FACE_KEYS


def _t_ingest(payload: dict):
    name = str(payload.get("filename", "clip"))
    b64 = payload.get("fileB64") or ""
    size = int(len(b64) * 3 / 4)
    r = _rand(_h(name + str(size)))
    base = 4 if size < 400_000 else 7 if size < 3_000_000 else 8.5
    score = _c10(base + (r() - 0.5) * 3)
    status = "GOOD FOR TRAINING"
    if score < 4:
        status = "TOO MUCH BACKGROUND NOISE"
    elif score < 5.5:
        status = "NEEDS BETTER AUDIO"
    return {"result": {"qualityScore": score, "qualityStatus": status,
                       "meta": {"est_speech_seconds": round(size / 120000),
                                "est_frames": round(size / 500000 * 25)}}}, None, None


def _t_build_dataset(payload: dict):
    vids = payload.get("videos", [])
    speech = sum(float((v.get("meta") or {}).get("est_speech_seconds", 0)) for v in vids)
    frames = sum(int((v.get("meta") or {}).get("est_frames", 0)) for v in vids)
    ok = sum(1 for v in vids if v.get("quality_status") == "GOOD FOR TRAINING")
    return {"result": {"clipCount": round(speech / 6), "speechSeconds": round(speech),
                       "frameCount": frames,
                       "faceOkRatio": round(ok / len(vids), 2) if vids else 0}}, None, None


def _t_train(payload: dict, set_stage=None):
    for st in ("preprocessing", "transcribing", "building_dataset", "training", "evaluating"):
        if set_stage:
            set_stage(st)
        time.sleep(0.6)
    profile = str(payload.get("profile", "voice"))
    stats = payload.get("datasetStats", {})
    mins = float(stats.get("speechSeconds", 0)) / 60
    r = _rand(_h(profile + str(payload.get("datasetId")) + str(payload.get("baseModel"))))
    curve = 8.4 * (1 - math.exp(-mins / 12))
    penalty = (mins - 45) / 40 if mins > 45 else 0
    agg = _c10(curve - penalty + (r() - 0.5) * 1.2)
    breakdown = {k: _c10(agg + (r() - 0.5) * 2) for k in _keys_for(profile)}
    return {"result": {"baseModel": payload.get("baseModel", ""), "evalScore": agg,
                       "evalBreakdown": breakdown, "gpuUsed": "mock worker",
                       "license": "n/a (mock)", "kind": "MOCK"}}, None, None


def _t_evaluate(payload: dict):
    profile = str(payload.get("profile", "voice"))
    is_face = profile in ("face_identity", "face_performance")
    text = str(payload.get("scriptText", ""))
    words = max(1, len(text.split()))
    if is_face:
        data, mime, _ = _gen_face({"width": 480, "height": 600})
    else:
        data, mime, _ = _gen_voice({"text": text, "seconds": max(2, words / 2.3)})
    r = _rand(_h(str(payload.get("versionId")) + str(payload.get("testKey"))))
    scores = {k: _c10(4 + 1.4 + (r() - 0.5) * 3) for k in _keys_for(profile)}
    return {"result": {"scores": scores, "kind": "MOCK"}}, data, mime


TRAINING = {"ingest": _t_ingest, "build_dataset": _t_build_dataset,
            "train": _t_train, "evaluate": _t_evaluate}


def _process(job_id: str, task: dict) -> None:
    with LOCK:
        JOBS[job_id]["status"] = "running"
    ttype = task.get("type")
    payload = task.get("payload", {})
    try:
        if ttype in GENERATORS:
            data, mime, meta = GENERATORS[ttype](payload)
            with LOCK:
                JOBS[job_id].update(status="done", artifact=data, mime=mime,
                                    kind="MOCK", model=MODELS[ttype], meta=meta)
            return

        if ttype == "train":
            def set_stage(s):
                with LOCK:
                    JOBS[job_id]["stage"] = s
            body, data, mime = _t_train(payload, set_stage)
        else:
            body, data, mime = TRAINING[ttype](payload)

        with LOCK:
            JOBS[job_id].update(status="done", result=body.get("result", {}),
                                artifact=data, mime=mime, kind="MOCK", model=f"mock-{ttype}")
    except Exception as exc:  # noqa: BLE001
        with LOCK:
            JOBS[job_id].update(status="error", error=str(exc))


# --------------------------- http surface ---------------------------

class Handler(BaseHTTPRequestHandler):
    def _auth_ok(self) -> bool:
        if not TOKEN:
            return True
        return self.headers.get("Authorization", "") == f"Bearer {TOKEN}"

    def _json(self, code: int, body: dict) -> None:
        payload = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *_):  # quiet
        pass

    def do_GET(self):  # noqa: N802
        if self.path == "/health":
            return self._json(200, {"ok": True, "impl": "mock", "gpu": False})
        if not self._auth_ok():
            return self._json(401, {"error": "unauthorized"})
        if self.path.startswith("/jobs/"):
            jid = self.path.split("/", 2)[2]
            with LOCK:
                job = JOBS.get(jid)
            if not job:
                return self._json(404, {"error": "no such job"})
            if job["status"] == "done":
                resp = {
                    "status": "done", "kind": job.get("kind", "MOCK"),
                    "model": job.get("model", ""), "meta": job.get("meta", {}),
                }
                if job.get("artifact") is not None:
                    resp["artifactUrl"] = f"/artifacts/{jid}"
                    resp["mime"] = job.get("mime")
                if "result" in job:
                    resp["result"] = job["result"]
                return self._json(200, resp)
            if job["status"] == "error":
                return self._json(200, {"status": "error", "error": job.get("error", "")})
            return self._json(200, {"status": job["status"], "stage": job.get("stage", "")})
        if self.path.startswith("/artifacts/"):
            jid = self.path.split("/", 2)[2]
            with LOCK:
                job = JOBS.get(jid)
            if not job or job.get("status") != "done" or job.get("artifact") is None:
                return self._json(404, {"error": "not ready"})
            data = job["artifact"]
            self.send_response(200)
            self.send_header("Content-Type", job["mime"])
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        return self._json(404, {"error": "not found"})

    def do_POST(self):  # noqa: N802
        if not self._auth_ok():
            return self._json(401, {"error": "unauthorized"})
        if self.path != "/run":
            return self._json(404, {"error": "not found"})
        length = int(self.headers.get("Content-Length", "0"))
        task = json.loads(self.rfile.read(length) or b"{}")
        if task.get("type") not in GENERATORS and task.get("type") not in TRAINING:
            return self._json(400, {"error": "bad task type"})
        jid = uuid.uuid4().hex
        with LOCK:
            JOBS[jid] = {"status": "queued"}
        threading.Thread(target=_process, args=(jid, task), daemon=True).start()
        return self._json(202, {"jobId": jid})


if __name__ == "__main__":
    print(f"[mock-worker] listening on :{PORT}  (auth: {'on' if TOKEN else 'off'})")
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
