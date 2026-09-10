#!/usr/bin/env python3
"""
Phase 3 voice worker — EXPERIMENTAL, GPU-required, NOT YET TESTED.

Two jobs:
  --mode benchmark   generate every TANZANIA_VOICE_BENCHMARK.md sentence so the
                     founder can listen and score against the §4 bar.
  --mode serve       expose worker/contract.md over HTTP so the Next.js app can
                     use it as GPU_PROVIDER=http (voice task only, for now).

Two backends (pick with --backend), because no open zero-shot cloner officially
supports Tanzanian Swahili — you compare them:
  xtts   Coqui XTTS v2 — clones the founder's voice from a ~10s reference.
         Swahili is NOT in XTTS v2's official language list; we force "sw" and
         you judge whether the pronunciation/accent is acceptable (§4). This is
         the candidate most likely to fail the accent gate — that's the point of
         testing it.
  mms    Meta MMS-TTS (swh) — real Swahili, but a single fixed speaker and no
         cloning. Use it as the pronunciation/accent BASELINE to score against.

Nothing here is production. Label every output MOCK/EXPERIMENTAL, never blur
(brief §0). Fill MODEL_DEPLOYMENT.md with what you actually observe.
"""
from __future__ import annotations

import argparse
import io
import json
import os
import pathlib
import threading
import uuid
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = pathlib.Path(__file__).parent
SENTENCES = json.loads((HERE / "benchmark_sentences.json").read_text())["sentences"]

MODEL_NAMES = {"xtts": "coqui/xtts_v2", "mms": "facebook/mms-tts-swh"}


# --------------------------------------------------------------------------- #
#  Backends. Each returns a path to a wav file it wrote.                      #
# --------------------------------------------------------------------------- #

_xtts = None
_mms = None


def _load_xtts():
    global _xtts
    if _xtts is None:
        from TTS.api import TTS  # coqui-tts

        _xtts = TTS("tts_models/multilingual/multi-dataset/xtts_v2")
        if os.environ.get("FORCE_CPU") != "1":
            _xtts.to("cuda")
    return _xtts


def _load_mms():
    global _mms
    if _mms is None:
        from transformers import VitsModel, AutoTokenizer  # type: ignore
        import torch  # noqa: F401

        tok = AutoTokenizer.from_pretrained("facebook/mms-tts-swh")
        model = VitsModel.from_pretrained("facebook/mms-tts-swh")
        _mms = (tok, model)
    return _mms


def synth_xtts(text: str, ref_wav: str, out_path: str) -> str:
    if not ref_wav or not os.path.exists(ref_wav):
        raise ValueError("xtts backend needs --ref pointing at a real wav")
    tts = _load_xtts()
    # "sw" is unsupported officially; this may raise. Caller records the result.
    tts.tts_to_file(text=text, speaker_wav=ref_wav, language="sw", file_path=out_path)
    return out_path


def synth_mms(text: str, ref_wav: str, out_path: str) -> str:
    import numpy as np  # noqa
    import torch

    tok, model = _load_mms()
    inputs = tok(text, return_tensors="pt")
    with torch.no_grad():
        wav = model(**inputs).waveform.squeeze().cpu().numpy()
    pcm = (wav / max(1e-9, abs(wav).max()) * 32767).astype("<i2")
    with wave.open(out_path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(model.config.sampling_rate)
        w.writeframes(pcm.tobytes())
    return out_path


BACKENDS = {"xtts": synth_xtts, "mms": synth_mms}


# --------------------------------------------------------------------------- #
#  Mode: benchmark                                                           #
# --------------------------------------------------------------------------- #

def run_benchmark(backend: str, ref_wav: str, out_dir: str) -> None:
    fn = BACKENDS[backend]
    root = pathlib.Path(out_dir) / backend
    root.mkdir(parents=True, exist_ok=True)
    results = []
    for s in SENTENCES:
        out = str(root / f"{s['id']}_{s['category']}.wav")
        status = "ok"
        try:
            fn(s["text"], ref_wav, out)
        except Exception as exc:  # noqa: BLE001
            status = f"ERROR: {exc}"
            print(f"  {s['id']}: {status}")
        results.append({"id": s["id"], "category": s["category"], "status": status, "file": out})
    (root / "_results.json").write_text(json.dumps(results, indent=2, ensure_ascii=False))
    ok = sum(r["status"] == "ok" for r in results)
    print(f"\n{backend}: {ok}/{len(results)} sentences generated -> {root}")
    print("Listen to each, then score in TANZANIA_VOICE_BENCHMARK.md / MODEL_EVALUATION.md.")


# --------------------------------------------------------------------------- #
#  Mode: serve  (worker/contract.md, voice task only)                        #
# --------------------------------------------------------------------------- #

JOBS: dict[str, dict] = {}
LOCK = threading.Lock()
TOKEN = os.environ.get("GPU_WORKER_TOKEN", "")


def _serve_process(job_id: str, task: dict, backend: str, ref_wav: str) -> None:
    with LOCK:
        JOBS[job_id]["status"] = "running"
    try:
        payload = task.get("payload", {})
        tmp = f"/tmp/{job_id}.wav"
        BACKENDS[backend](payload["text"], ref_wav, tmp)
        data = pathlib.Path(tmp).read_bytes()
        with LOCK:
            JOBS[job_id].update(
                status="done", artifact=data, mime="audio/wav",
                kind="EXPERIMENTAL", model=MODEL_NAMES[backend],
                meta={"backend": backend, "emotion": payload.get("emotion")},
            )
    except Exception as exc:  # noqa: BLE001
        with LOCK:
            JOBS[job_id].update(status="error", error=str(exc))


def make_handler(backend: str, ref_wav: str):
    class H(BaseHTTPRequestHandler):
        def _auth_ok(self):
            return not TOKEN or self.headers.get("Authorization") == f"Bearer {TOKEN}"

        def _json(self, code, body):
            b = json.dumps(body).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(b)))
            self.end_headers()
            self.wfile.write(b)

        def log_message(self, *_):
            pass

        def do_GET(self):
            if self.path == "/health":
                return self._json(200, {"ok": True, "impl": backend, "gpu": True})
            if not self._auth_ok():
                return self._json(401, {"error": "unauthorized"})
            if self.path.startswith("/jobs/"):
                jid = self.path.split("/", 2)[2]
                with LOCK:
                    j = JOBS.get(jid)
                if not j:
                    return self._json(404, {"error": "no such job"})
                if j["status"] == "done":
                    return self._json(200, {
                        "status": "done", "artifactUrl": f"/artifacts/{jid}",
                        "mime": j["mime"], "kind": j["kind"], "model": j["model"], "meta": j["meta"],
                    })
                if j["status"] == "error":
                    return self._json(200, {"status": "error", "error": j.get("error", "")})
                return self._json(200, {"status": j["status"]})
            if self.path.startswith("/artifacts/"):
                jid = self.path.split("/", 2)[2]
                with LOCK:
                    j = JOBS.get(jid)
                if not j or j.get("status") != "done":
                    return self._json(404, {"error": "not ready"})
                self.send_response(200)
                self.send_header("Content-Type", j["mime"])
                self.send_header("Content-Length", str(len(j["artifact"])))
                self.end_headers()
                self.wfile.write(j["artifact"])
                return
            return self._json(404, {"error": "not found"})

        def do_POST(self):
            if not self._auth_ok():
                return self._json(401, {"error": "unauthorized"})
            if self.path != "/run":
                return self._json(404, {"error": "not found"})
            n = int(self.headers.get("Content-Length", "0"))
            task = json.loads(self.rfile.read(n) or b"{}")
            if task.get("type") != "voice":
                return self._json(400, {"error": "this worker only handles the 'voice' task"})
            jid = uuid.uuid4().hex
            with LOCK:
                JOBS[jid] = {"status": "queued"}
            threading.Thread(
                target=_serve_process, args=(jid, task, backend, ref_wav), daemon=True
            ).start()
            return self._json(202, {"jobId": jid})

    return H


def run_serve(backend: str, ref_wav: str, port: int) -> None:
    if backend == "xtts" and (not ref_wav or not os.path.exists(ref_wav)):
        raise SystemExit("serve mode with xtts needs --ref <founder reference wav>")
    print(f"[voice-worker] backend={backend} listening on :{port}  auth={'on' if TOKEN else 'off'}")
    print("Expose it (Colab): cloudflared tunnel --url http://localhost:%d" % port)
    ThreadingHTTPServer(("0.0.0.0", port), make_handler(backend, ref_wav)).serve_forever()


# --------------------------------------------------------------------------- #

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", choices=["benchmark", "serve"], required=True)
    ap.add_argument("--backend", choices=["xtts", "mms"], required=True)
    ap.add_argument("--ref", default="", help="founder reference wav (xtts only)")
    ap.add_argument("--out", default="./out", help="benchmark output dir")
    ap.add_argument("--port", type=int, default=8800)
    a = ap.parse_args()
    if a.mode == "benchmark":
        run_benchmark(a.backend, a.ref, a.out)
    else:
        run_serve(a.backend, a.ref, a.port)


if __name__ == "__main__":
    main()
