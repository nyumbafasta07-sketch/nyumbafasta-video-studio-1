#!/usr/bin/env python3
"""
Phase 3 voice worker — EXPERIMENTAL, GPU-required, NOT production.

Modes:
  --mode benchmark   generate the TANZANIA_VOICE_BENCHMARK.md sentences to listen
                     to and score against the §4 bar.
  --mode serve       expose worker/contract.md over HTTP (voice task only) so the
                     Next.js app can use it as GPU_PROVIDER=http.

Backends (--backend):
  mms      Meta MMS-TTS (swh). Real Swahili, single fixed speaker, NO cloning.
           Reliable. This is the pronunciation / accent BASELINE.
  f5tts    F5-TTS — zero-shot voice clone, MIT-ish licence, actively
           maintained, no piper-phonemize-style broken dependency. Not
           officially trained on Swahili — try it before committing to any
           fine-tune (brief §8.1) and judge pronunciation honestly.
  xtts     Coqui XTTS v2 (Colab install brittle; kept for local use).
           NO Swahili — you pass --lang (default en) and use it only to judge
           "does this sound like me?" (timbre), not Swahili correctness.
  chatterbox  Resemble AI Chatterbox, MIT, English-only timbre check.

--ref may be a .wav OR a video/other audio file; it is auto-converted with
ffmpeg to a trimmed mono wav.

Label every output MOCK / EXPERIMENTAL — never blur (brief §0).
"""
from __future__ import annotations

import argparse
import json
import os
import pathlib
import subprocess
import threading
import uuid
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = pathlib.Path(__file__).parent
SENTENCES = json.loads((HERE / "benchmark_sentences.json").read_text())["sentences"]

# English "voice ID card" lines — only for the xtts timbre check.
XTTS_IDENTITY = [
    {"id": "ID1", "category": "identity-en",
     "text": "Hi, this is a short sample of my natural speaking voice for testing."},
    {"id": "ID2", "category": "identity-en",
     "text": "I run a business and I make content about marketing and money."},
    {"id": "ID3", "category": "identity-en",
     "text": "If this sounds like me, the voice cloning is working well enough."},
]

MODEL_NAMES = {
    "xtts": "coqui/xtts_v2", "mms": "facebook/mms-tts-swh",
    "chatterbox": "resemble-ai/chatterbox", "f5tts": "SWivid/F5-TTS",
}


# --------------------------------------------------------------------------- #
#  reference audio                                                           #
# --------------------------------------------------------------------------- #

def ensure_wav(path: str, start: float = 0.0, dur: float = 25.0, sr: int = 22050) -> str:
    """Return a mono wav path. Converts video / m4a / mp3 with ffmpeg and trims."""
    if not path:
        return path
    if path.lower().endswith(".wav") and start == 0.0 and dur is None:
        return path
    out = "/tmp/_reference.wav"
    cmd = ["ffmpeg", "-y", "-i", path, "-vn", "-ac", "1", "-ar", str(sr)]
    if start:
        cmd += ["-ss", str(start)]
    if dur:
        cmd += ["-t", str(dur)]
    cmd += [out]
    subprocess.run(cmd, check=True, capture_output=True)
    return out


# --------------------------------------------------------------------------- #
#  backends                                                                  #
# --------------------------------------------------------------------------- #

_xtts = None
_mms = None
_cb = None
_f5 = None


def _load_xtts():
    global _xtts
    if _xtts is None:
        import torch

        # torch >= 2.6 defaults torch.load(weights_only=True), which breaks the
        # XTTS v2 checkpoint. Force the old behaviour.
        _orig_load = torch.load

        def _patched_load(*a, **k):
            k.setdefault("weights_only", False)
            return _orig_load(*a, **k)

        torch.load = _patched_load
        try:
            from TTS.tts.configs.xtts_config import XttsConfig
            from TTS.tts.models.xtts import XttsAudioConfig, XttsArgs
            from TTS.config.shared_configs import BaseDatasetConfig

            torch.serialization.add_safe_globals(
                [XttsConfig, XttsAudioConfig, XttsArgs, BaseDatasetConfig]
            )
        except Exception:
            pass

        from TTS.api import TTS

        _xtts = TTS("tts_models/multilingual/multi-dataset/xtts_v2")
        if os.environ.get("FORCE_CPU") != "1":
            _xtts.to("cuda")
    return _xtts


def _load_mms():
    global _mms
    if _mms is None:
        from transformers import AutoTokenizer, VitsModel  # type: ignore

        tok = AutoTokenizer.from_pretrained("facebook/mms-tts-swh")
        model = VitsModel.from_pretrained("facebook/mms-tts-swh")
        _mms = (tok, model)
    return _mms


def synth_xtts(text: str, ref_wav: str, out_path: str, lang: str = "en") -> str:
    if not ref_wav or not os.path.exists(ref_wav):
        raise ValueError("xtts needs --ref pointing at a real audio/video file")
    _load_xtts().tts_to_file(
        text=text, speaker_wav=ref_wav, language=lang, file_path=out_path
    )
    return out_path


def _load_f5():
    global _f5
    if _f5 is None:
        from f5_tts.api import F5TTS  # type: ignore

        _f5 = F5TTS(device="cpu" if os.environ.get("FORCE_CPU") == "1" else "cuda")
    return _f5


def synth_f5(text: str, ref_wav: str, out_path: str, lang: str = "sw") -> str:
    """F5-TTS — zero-shot voice clone (flow-matching). MIT-ish licence, no
    piper-phonemize-style broken dependency. Not officially trained on
    Swahili (mostly EN/ZH) but conditioning-first is worth trying before any
    fine-tune (brief §8.1) — judge pronunciation honestly, don't assume it
    works. ref_wav doubles as both the founder's voice AND (via its
    transcript) the style reference F5 requires; pass --ref-text if the auto
    transcription is wrong."""
    if not ref_wav or not os.path.exists(ref_wav):
        raise ValueError("f5tts needs --ref pointing at a real audio/video file")
    tts = _load_f5()
    ref_text = os.environ.get("F5_REF_TEXT", "")  # "" = F5 auto-transcribes the ref clip
    tts.infer(ref_file=ref_wav, ref_text=ref_text, gen_text=text, file_wave=out_path)
    return out_path


def _load_chatterbox():
    global _cb
    if _cb is None:
        from chatterbox.tts import ChatterboxTTS

        device = "cpu" if os.environ.get("FORCE_CPU") == "1" else "cuda"
        _cb = ChatterboxTTS.from_pretrained(device=device)
    return _cb


def synth_chatterbox(text: str, ref_wav: str, out_path: str, lang: str = "en") -> str:
    """Resemble AI Chatterbox — MIT, English zero-shot voice clone. Timbre check
    only (no Swahili). More install-robust on Colab than coqui-tts/XTTS."""
    if not ref_wav or not os.path.exists(ref_wav):
        raise ValueError("chatterbox needs --ref pointing at a real audio/video file")
    import torchaudio

    model = _load_chatterbox()
    wav = model.generate(text, audio_prompt_path=ref_wav)
    torchaudio.save(out_path, wav.detach().cpu(), model.sr)
    return out_path


# MMS mispronounces some words — respell them phonetically here. This is a
# band-aid, not a fix for the accent (add pairs for words you hear wrong).
# Loaded from pronunciation_fixes.json if present.
_PRON_FIXES: dict[str, str] = {}
_pf = HERE / "pronunciation_fixes.json"
if _pf.exists():
    try:
        _PRON_FIXES = json.loads(_pf.read_text())
    except Exception:
        _PRON_FIXES = {}

# knobs (env-overridable): MMS_RATE lower = slower/less clipped; MMS_NOISE higher
# = more prosodic variation (too high = artefacts).
MMS_RATE = float(os.environ.get("MMS_RATE", "0.85"))
MMS_NOISE = float(os.environ.get("MMS_NOISE", "0.70"))


def _apply_pron_fixes(text: str) -> str:
    import re

    for bad, good in _PRON_FIXES.items():
        if bad.startswith("_") or not isinstance(good, str):
            continue
        text = re.sub(rf"\b{re.escape(bad)}\b", good, text, flags=re.IGNORECASE)
    return text


def synth_mms(text: str, ref_wav: str, out_path: str, lang: str = "sw") -> str:
    import torch

    tok, model = _load_mms()
    # VITS prosody knobs live on the config; set before the forward pass.
    for attr, val in (("speaking_rate", MMS_RATE), ("noise_scale", MMS_NOISE)):
        if hasattr(model.config, attr):
            setattr(model.config, attr, val)
    inputs = tok(_apply_pron_fixes(text), return_tensors="pt")
    with torch.no_grad():
        wav = model(**inputs).waveform.squeeze().cpu().numpy()
    peak = max(1e-9, float(abs(wav).max()))
    pcm = (wav / peak * 32767).astype("<i2")
    with wave.open(out_path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(int(model.config.sampling_rate))
        w.writeframes(pcm.tobytes())
    return out_path


BACKENDS = {"xtts": synth_xtts, "mms": synth_mms, "chatterbox": synth_chatterbox, "f5tts": synth_f5}

# backends that clone the founder's voice (English only) -> prepend the ID lines
CLONE_BACKENDS = {"xtts", "chatterbox", "f5tts"}


# --------------------------------------------------------------------------- #
#  mode: benchmark                                                           #
# --------------------------------------------------------------------------- #

def run_benchmark(backend: str, ref: str, out_dir: str, lang: str) -> None:
    ref_wav = ensure_wav(ref) if ref else ""
    if backend in CLONE_BACKENDS and ref_wav:
        print(f"reference converted -> {ref_wav}")

    items = list(SENTENCES)
    if backend in CLONE_BACKENDS:
        items = XTTS_IDENTITY + items

    fn = BACKENDS[backend]
    root = pathlib.Path(out_dir) / backend
    root.mkdir(parents=True, exist_ok=True)
    results = []
    for s in items:
        out = str(root / f"{s['id']}_{s['category']}.wav")
        status = "ok"
        try:
            fn(s["text"], ref_wav, out, lang)
        except Exception as exc:  # noqa: BLE001
            status = f"ERROR: {type(exc).__name__}: {exc}"
        print(f"  {s['id']:5s} {s['category']:14s} {status}")
        results.append({"id": s["id"], "category": s["category"], "status": status, "file": out})
    (root / "_results.json").write_text(json.dumps(results, indent=2, ensure_ascii=False))
    ok = sum(r["status"] == "ok" for r in results)
    print(f"\n{backend}: {ok}/{len(results)} generated -> {root}")
    if ok == 0:
        print("NOTHING generated — read the ERROR lines above; that is the real problem.")


# --------------------------------------------------------------------------- #
#  mode: serve  (worker/contract.md, voice task only)                        #
# --------------------------------------------------------------------------- #

JOBS: dict[str, dict] = {}
LOCK = threading.Lock()
TOKEN = os.environ.get("GPU_WORKER_TOKEN", "")


def _serve_process(job_id: str, task: dict, backend: str, ref_wav: str, lang: str) -> None:
    with LOCK:
        JOBS[job_id]["status"] = "running"
    try:
        payload = task.get("payload", {})
        tmp = f"/tmp/{job_id}.wav"
        BACKENDS[backend](payload["text"], ref_wav, tmp, lang)
        data = pathlib.Path(tmp).read_bytes()
        with LOCK:
            JOBS[job_id].update(
                status="done", artifact=data, mime="audio/wav",
                kind="EXPERIMENTAL", model=MODEL_NAMES[backend],
                meta={"backend": backend, "lang": lang, "emotion": payload.get("emotion")},
            )
    except Exception as exc:  # noqa: BLE001
        with LOCK:
            JOBS[job_id].update(status="error", error=f"{type(exc).__name__}: {exc}")


def make_handler(backend: str, ref_wav: str, lang: str):
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
                target=_serve_process, args=(jid, task, backend, ref_wav, lang), daemon=True
            ).start()
            return self._json(202, {"jobId": jid})

    return H


def run_serve(backend: str, ref: str, port: int, lang: str) -> None:
    ref_wav = ensure_wav(ref) if ref else ""
    if backend == "xtts" and not ref_wav:
        raise SystemExit("serve mode with xtts needs --ref <founder reference clip>")
    print(f"[voice-worker] backend={backend} lang={lang} port={port} auth={'on' if TOKEN else 'off'}")
    ThreadingHTTPServer(("0.0.0.0", port), make_handler(backend, ref_wav, lang)).serve_forever()


# --------------------------------------------------------------------------- #

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", choices=["benchmark", "serve"], required=True)
    ap.add_argument("--backend", choices=["xtts", "mms", "chatterbox", "f5tts"], required=True)
    ap.add_argument("--ref", default="", help="founder reference clip (wav or video)")
    ap.add_argument("--out", default="./out")
    ap.add_argument("--port", type=int, default=8800)
    ap.add_argument("--lang", default="en", help="xtts language tag (xtts has no Swahili)")
    a = ap.parse_args()
    if a.mode == "benchmark":
        run_benchmark(a.backend, a.ref, a.out, a.lang)
    else:
        run_serve(a.backend, a.ref, a.port, a.lang)


if __name__ == "__main__":
    main()
