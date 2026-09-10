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


def _process(job_id: str, task: dict) -> None:
    with LOCK:
        JOBS[job_id]["status"] = "running"
    try:
        gen = GENERATORS[task["type"]]
        data, mime, meta = gen(task.get("payload", {}))
        with LOCK:
            JOBS[job_id].update(
                status="done", artifact=data, mime=mime, kind="MOCK",
                model=MODELS[task["type"]], meta=meta,
            )
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
                return self._json(200, {
                    "status": "done",
                    "artifactUrl": f"/artifacts/{jid}",
                    "mime": job["mime"], "kind": job["kind"],
                    "model": job["model"], "meta": job["meta"],
                })
            if job["status"] == "error":
                return self._json(200, {"status": "error", "error": job.get("error", "")})
            return self._json(200, {"status": job["status"]})
        if self.path.startswith("/artifacts/"):
            jid = self.path.split("/", 2)[2]
            with LOCK:
                job = JOBS.get(jid)
            if not job or job.get("status") != "done":
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
        if task.get("type") not in GENERATORS:
            return self._json(400, {"error": "bad task type"})
        jid = uuid.uuid4().hex
        with LOCK:
            JOBS[jid] = {"status": "queued"}
        threading.Thread(target=_process, args=(jid, task), daemon=True).start()
        return self._json(202, {"jobId": jid})


if __name__ == "__main__":
    print(f"[mock-worker] listening on :{PORT}  (auth: {'on' if TOKEN else 'off'})")
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
