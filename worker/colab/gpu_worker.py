#!/usr/bin/env python3
"""
REAL GPU worker — voice only (Phase 3 / L1). EXPERIMENTAL, untested.

Implements worker/contract.md (generation + training) with real models:
  ingest        -> ffmpeg + faster-whisper (Swahili) -> clips + transcripts
  build_dataset -> assemble a dataset from ingested clips
  train         -> F5-TTS fine-tune (profile=voice only) -> ckpts/<modelRef>/model_last.pt
  evaluate      -> F5-TTS synth of a fixed script -> wav preview
  voice         -> F5-TTS synth with the PRODUCTION model (modelRef)
  face/lipsync  -> still MOCK here (real ones are Phase 4/5)

Voice was Piper until 2026-09; piper-phonemize has zero PyPI distributions
for Python 3.13 (unfixable via pinning), so voice training moved to F5-TTS
(MIT-ish, actively maintained, supports real fine-tuning not just zero-shot
conditioning). Needs the F5-TTS repo cloned + editable-installed so that its
own train scripts can resolve their package-relative data/ckpts dirs — see
F5TTS_REPO_DIR below and the install cell in gpu_worker.ipynb.

The app (Training Studio + Settings -> Compute) drives this over HTTP. Point
GPU_WORKER_URL at wherever this runs (Colab tunnel, Kaggle, a local NVIDIA box).

State lives under WORK_DIR (default /content/vs-work):
  videos/<sha1>/    per-recording clips + metadata      (from ingest)
  datasets/<ref>/   assembled dataset                    (from build_dataset)
  models/<ref>.f5.json  pointer to the F5-TTS checkpoint (from train)

Run:  python gpu_worker.py            (listens on :8800)
Env:  WORK_DIR, GPU_WORKER_TOKEN, PORT, FFMPEG, WHISPER_SIZE (default medium)
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
WHISPER = os.environ.get("WHISPER_SIZE", "medium")  # "small" under-transcribes Swahili; T4 handles medium fine

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
    spans = ing.silence_windows(full, noise_db=ing.adaptive_noise_db(vol))

    rows, speech = [], 0.0
    for i, (s, e) in enumerate(spans):
        cid = f"{ref}_{i:04d}"
        clip = vdir / "wavs" / f"{cid}.wav"
        ing.cut(full, s, e, clip)
        text, conf = ing.transcribe(clip, WHISPER, payload.get("lang", "sw"))
        if len(text) < 3 or conf < -2.2:
            clip.unlink(missing_ok=True)
            continue
        rows.append(f"{cid}|{text}")
        speech += e - s
    (vdir / "metadata.csv").write_text("\n".join(rows) + "\n", encoding="utf-8")

    # 60s assumed one long source video; the actual workflow is many SHORT
    # clips (brief §8.2 "variety helps" — several videos, not one marathon).
    # A ~60s clip with 20s+ of recognised speech is good content, not a
    # problem — only flag genuinely thin/near-silent recordings.
    score = 10
    status = "GOOD FOR TRAINING"
    if vol < -34:
        score -= 3; status = "TOO MUCH BACKGROUND NOISE"
    if speech < 15:
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
    (ddir / "videos.json").write_text(json.dumps(refs))  # source refs for face/lipsync training
    return {"result": {"clipCount": len(rows), "speechSeconds": round(speech),
                       "frameCount": 0, "faceOkRatio": 0, "workerRef": dref}}, None, None


def _wav_seconds(p: pathlib.Path) -> float:
    try:
        with wave.open(str(p), "rb") as w:
            return w.getnframes() / float(w.getframerate())
    except Exception:
        return 0.0


# --------------------------------------------------------------------------- #
#  train  (F5-TTS fine-tune, voice only)                                     #
# --------------------------------------------------------------------------- #

FACE_MODEL = os.environ.get("FACE_MODEL", "sadtalker")  # sadtalker | liveportrait
SADTALKER_DIR = os.environ.get("SADTALKER_DIR", "/content/SadTalker")
LIVEPORTRAIT_DIR = os.environ.get("LIVEPORTRAIT_DIR", "/content/LivePortrait")

# F5-TTS's own train scripts resolve their data/ckpts dirs as
# "<installed f5_tts package dir>/../../{data,ckpts}" — that only lands inside
# the repo if F5-TTS was `pip install -e .`'d from a clone at this path (a
# plain `pip install f5-tts` from PyPI, fine for zero-shot inference, does
# NOT work for training). See gpu_worker.ipynb's install cell.
F5TTS_REPO_DIR = os.environ.get("F5TTS_REPO_DIR", "/content/F5-TTS")
F5_EXP_NAME = os.environ.get("F5_EXP_NAME", "F5TTS_v1_Base")
F5_TOKENIZER = os.environ.get("F5_TOKENIZER", "pinyin")  # matches the pretrained ckpt's vocab


def do_train(payload: dict, set_stage=None):
    profile = payload.get("profile")
    if profile in ("face_identity", "face_performance", "lipsync"):
        return _train_face(payload, set_stage)
    if profile == "speaking_style":
        raise ValueError("speaking_style training not implemented in gpu_worker (Phase 6)")
    if profile != "voice":
        raise ValueError(f"unknown profile {profile!r}")
    return _train_voice(payload, set_stage)


def _train_voice(payload: dict, set_stage=None):
    dref = str(payload.get("datasetRef") or "")
    ddir = WORK / "datasets" / dref
    if not (ddir / "metadata.csv").exists():
        raise ValueError("dataset not on this worker — rebuild the dataset against this worker")
    f5_pkg = pathlib.Path(F5TTS_REPO_DIR) / "src" / "f5_tts"
    if not f5_pkg.is_dir():
        raise ValueError(
            f"F5-TTS repo not found at {F5TTS_REPO_DIR} — clone it and `pip install -e .` "
            "first (see the install cell in gpu_worker.ipynb)"
        )

    model_ref = f"voice-{dref[:8]}-{int(time.time())}"
    tmp = WORK / "tmp" / model_ref
    tmp.mkdir(parents=True, exist_ok=True)

    # F5-TTS's data-prep script wants a CSV: "audio_file|text", absolute paths.
    rows = ["audio_file|text"]
    best_ref = None  # (duration, wav_path, text) — a short, clean clip for cloning conditioning
    for line in (ddir / "metadata.csv").read_text(encoding="utf-8").splitlines():
        if "|" not in line:
            continue
        cid, text = line.split("|", 1)
        text = text.strip()
        wav = (ddir / "wavs" / f"{cid}.wav").resolve()
        if not wav.exists() or not text:
            continue
        rows.append(f"{wav}|{text}")
        dur = _wav_seconds(wav)
        if 2.0 <= dur <= 12.0 and (best_ref is None or dur > best_ref[0]):
            best_ref = (dur, wav, text)
    if len(rows) < 2:
        raise ValueError("dataset has no usable clips — re-ingest with more speech")
    if best_ref is None:
        # no clip in the ideal 2-12s range — fall back to whatever exists
        cid, text = rows[1].split("|", 1)
    csv_path = tmp / "train.csv"
    csv_path.write_text("\n".join(rows) + "\n", encoding="utf-8")

    data_dir = pathlib.Path(F5TTS_REPO_DIR) / "data" / f"{model_ref}_{F5_TOKENIZER}"

    if set_stage:
        set_stage("preprocessing")
    subprocess.run(
        ["python", str(f5_pkg / "train/datasets/prepare_csv_wavs.py"), str(csv_path), str(data_dir)],
        check=True, capture_output=True, cwd=F5TTS_REPO_DIR,
    )

    if set_stage:
        set_stage("training")
    # Small founder-sized datasets (minutes, not hours) need far fewer updates
    # than F5-TTS's from-scratch defaults — save_per_updates/last_per_updates
    # default to 50000/5000, which a tiny dataset may NEVER reach, silently
    # producing no checkpoint at all. Keep both low so at least one save fires.
    epochs = int(os.environ.get("F5_EPOCHS", "100"))
    bs = int(os.environ.get("F5_BATCH_SIZE", "1400"))  # frames/gpu — conservative for a T4
    save_every = int(os.environ.get("F5_SAVE_EVERY", "50"))
    lr = os.environ.get("F5_LR", "1e-5")
    # 0 = no forked DataLoader worker processes. F5-TTS's stock script
    # hardcodes 16 (OOMs free Colab); even 2 still OOM'd live (confirmed via
    # dmesg) because forking AFTER the main process has loaded torch/CUDA/the
    # model makes each fork's copy-on-write pages balloon into private dirty
    # memory (~2.3GB/worker observed) — unrelated to dataset size.
    workers = int(os.environ.get("F5_NUM_WORKERS", "0"))
    driver = os.environ.get("F5_FINETUNE_DRIVER", "/content/f5_finetune_driver.py")
    if not pathlib.Path(driver).exists():
        raise ValueError(f"F5 finetune driver not found at {driver} — re-run the notebook's writefile cell")
    # A long tqdm-heavy training run piped through capture_output=True buffers
    # its ENTIRE stdout/stderr in this process's memory until it exits — over
    # tens of minutes that alone can OOM the worker (killing the HTTP server
    # too, not just the training subprocess). Stream to a log file instead.
    log_path = tmp / "finetune.log"
    try:
        with open(log_path, "w") as logf:
            subprocess.run(
                ["accelerate", "launch", driver,
                 "--exp_name", F5_EXP_NAME, "--dataset_name", model_ref, "--finetune",
                 "--tokenizer", F5_TOKENIZER, "--epochs", str(epochs),
                 "--batch_size_per_gpu", str(bs), "--batch_size_type", "frame",
                 "--save_per_updates", str(save_every), "--last_per_updates", str(save_every),
                 "--learning_rate", lr, "--num_workers", str(workers)],
                check=True, stdout=logf, stderr=subprocess.STDOUT, cwd=F5TTS_REPO_DIR,
            )
    except subprocess.CalledProcessError as exc:
        tail = log_path.read_text(errors="replace")[-3000:] if log_path.exists() else ""
        raise ValueError(f"F5-TTS finetune failed (exit {exc.returncode}):\n{tail}") from None

    if set_stage:
        set_stage("evaluating")
    ckpt_dir = pathlib.Path(F5TTS_REPO_DIR) / "ckpts" / model_ref
    ckpt = ckpt_dir / "model_last.pt"
    if not ckpt.exists():
        # last_per_updates may not have lined up exactly — fall back to the
        # newest periodic checkpoint rather than declaring total failure.
        numbered = [p for p in ckpt_dir.glob("model_*.pt")
                   if p.name != "model_last.pt" and not p.name.startswith("pretrained_")]
        numbered.sort(key=lambda p: int(p.stem.split("_")[1]) if p.stem.split("_")[1].isdigit() else -1)
        if not numbered:
            raise ValueError(
                f"training finished but produced no checkpoint under {ckpt_dir} — "
                "the dataset may be too small for even one save interval; "
                "lower F5_SAVE_EVERY and retrain"
            )
        ckpt = numbered[-1]
    vocab = data_dir / "vocab.txt"
    (WORK / "models" / f"{model_ref}.f5.json").write_text(json.dumps({
        "ckpt": str(ckpt), "vocab": str(vocab), "exp_name": F5_EXP_NAME,
        "ref_wav": str(best_ref[1]) if best_ref else "",
        "ref_text": best_ref[2] if best_ref else "",
    }))

    mins = float(payload.get("datasetStats", {}).get("speechSeconds", 0)) / 60
    proxy = max(1.0, min(9.0, round(8.4 * (1 - math.exp(-mins / 12)), 1)))
    return {"result": {"baseModel": f"f5-tts/{F5_EXP_NAME} (finetuned)",
                       "modelRef": model_ref, "evalScore": proxy,
                       "evalBreakdown": {"note_human_eval_required": proxy},
                       "gpuUsed": _gpu_name(), "license": "CC-BY-NC (F5-TTS weights) — check before commercial use",
                       "kind": "EXPERIMENTAL"}}, None, None


def _gpu_name() -> str:
    try:
        out = subprocess.run(["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"],
                             capture_output=True, text=True).stdout.strip()
        return out or "gpu"
    except Exception:
        return "gpu"


# --------------------------------------------------------------------------- #
#  face_identity / face_performance / lipsync training                        #
#  These do NOT fine-tune a network — they build a FACE PROFILE from your     #
#  real video (best reference frame + a driving clip) that the animation      #
#  model (SadTalker / LivePortrait) uses at generation time. Realism depends  #
#  on that model + your video quality + the GPU (brief §4 / §8.3).            #
# --------------------------------------------------------------------------- #

_face_cascade = None


def _get_face_cascade():
    """OpenCV Haar cascade — bundled with opencv-python, a stable decades-old
    API. mediapipe's legacy `mp.solutions` face detector was removed in recent
    mediapipe releases (breaking on the founder's worker: 'module mediapipe
    has no attribute solutions') — this avoids that version fragility
    entirely instead of chasing a pinned version."""
    global _face_cascade
    import cv2  # type: ignore

    if _face_cascade is None:
        path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        _face_cascade = cv2.CascadeClassifier(path)
    return _face_cascade


def _detect_face(cv2mod, frame_bgr):
    """Returns the largest face as (x, y, w, h) in pixels, or None."""
    gray = cv2mod.cvtColor(frame_bgr, cv2mod.COLOR_BGR2GRAY)
    faces = _get_face_cascade().detectMultiScale(
        gray, scaleFactor=1.1, minNeighbors=5, minSize=(60, 60))
    if len(faces) == 0:
        return None
    # largest detected face = most likely the subject, not someone in the background
    return max(faces, key=lambda f: f[2] * f[3])


def _train_face(payload: dict, set_stage=None):
    import cv2  # type: ignore

    profile = payload["profile"]
    dref = str(payload.get("datasetRef") or "")
    ddir = WORK / "datasets" / dref
    vids_json = ddir / "videos.json"
    if not vids_json.exists():
        raise ValueError("dataset has no source videos on this worker — rebuild it here first")
    refs = json.loads(vids_json.read_text())

    model_ref = f"{profile}-{dref[:8]}-{int(time.time())}"
    fdir = WORK / "faces" / model_ref
    (fdir / "alts").mkdir(parents=True, exist_ok=True)

    if set_stage:
        set_stage("extracting_frames")
    best = []  # (score, frame_bgr, bbox)
    driving_src = None
    for r in refs:
        srcs = list((WORK / "videos" / r).glob("src.*"))
        if not srcs:
            continue
        driving_src = driving_src or srcs[0]
        cap = cv2.VideoCapture(str(srcs[0]))
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 0
        for k in range(24):
            cap.set(cv2.CAP_PROP_POS_FRAMES, int(total * (k + 0.5) / 24))
            ok, frame = cap.read()
            if not ok:
                continue
            h, w = frame.shape[:2]
            face = _detect_face(cv2, frame)
            if face is None:
                continue
            x, y, fw, fh = [int(v) for v in face]
            if fw < 0.12 * w or fh < 0.12 * h:
                continue
            # front-ish (face centred) + sharp
            centred = 1 - min(1, abs((x + fw / 2) / w - 0.5) * 4)
            crop = frame[y:y + fh, x:x + fw]
            if crop.size == 0:
                continue
            sharp = cv2.Laplacian(cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY), cv2.CV_64F).var()
            best.append((centred * 2 + min(sharp, 400) / 100, frame, (x, y, fw, fh)))
        cap.release()

    if not best:
        raise ValueError("no clear, front-facing face found in the training video — "
                         "record closer / better lit, mark it, rebuild the dataset")
    best.sort(key=lambda t: t[0], reverse=True)

    if set_stage:
        set_stage("building_profile")
    # full-frame reference (SadTalker/LivePortrait want a head-and-shoulders image)
    cv2.imwrite(str(fdir / "reference.png"), best[0][1])
    for i, (_, fr, _) in enumerate(best[1:5]):
        cv2.imwrite(str(fdir / "alts" / f"{i}.png"), fr)

    # identity-consistency proxy: how alike the top faces are (embedding-free: hist corr)
    def _hist(fr, box):
        x, y, w0, h0 = box
        c = cv2.cvtColor(fr[y:y + h0, x:x + w0], cv2.COLOR_BGR2HSV)
        return cv2.calcHist([c], [0, 1], None, [30, 32], [0, 180, 0, 256])
    h0 = _hist(best[0][1], best[0][2])
    sims = [cv2.compareHist(h0, _hist(fr, bx), cv2.HISTCMP_CORREL) for _, fr, bx in best[1:6]]
    consistency = round(max(0.0, sum(sims) / max(1, len(sims))), 3)

    meta = {"profile": profile, "model_ref": model_ref, "face_model": FACE_MODEL,
            "reference": str(fdir / "reference.png"), "frames_scored": len(best),
            "identity_consistency": consistency}

    if profile in ("face_performance", "lipsync") and driving_src:
        if set_stage:
            set_stage("extracting_driving_clip")
        drv = fdir / "driving.mp4"
        ff = os.environ.get("FFMPEG", "ffmpeg")
        # a short natural talking segment for LivePortrait / performance transfer
        subprocess.run([ff, "-hide_banner", "-y", "-ss", "3", "-t", "6", "-i", str(driving_src),
                        "-an", "-vf", "scale=512:-2,fps=25", str(drv)], check=True, capture_output=True)
        meta["driving_clip"] = str(drv)

    (fdir / "meta.json").write_text(json.dumps(meta))

    proxy = round(2 + consistency * 6 + min(1.0, len(best) / 20), 1)
    return {"result": {"baseModel": FACE_MODEL, "modelRef": model_ref,
                       "evalScore": max(1.0, min(9.0, proxy)),
                       "evalBreakdown": {"identity_consistency": round(consistency * 10, 1),
                                         "frames_scored": min(10, len(best) / 2)},
                       "gpuUsed": _gpu_name(),
                       "license": "SadTalker Apache-2.0 / LivePortrait MIT",
                       "kind": "EXPERIMENTAL"}}, None, None


def _talking_head(reference_png: pathlib.Path, audio_wav: pathlib.Path,
                  driving_mp4: pathlib.Path | None = None) -> bytes:
    """Animate `reference_png` to `audio_wav`. SadTalker (audio-driven) by default."""
    out_dir = WORK / "tmp" / uuid.uuid4().hex
    out_dir.mkdir(parents=True, exist_ok=True)
    if FACE_MODEL == "liveportrait" and driving_mp4 and driving_mp4.exists():
        subprocess.run(["python", f"{LIVEPORTRAIT_DIR}/inference.py",
                        "-s", str(reference_png), "-d", str(driving_mp4),
                        "-o", str(out_dir)], check=True, capture_output=True, cwd=LIVEPORTRAIT_DIR)
        mp4s = sorted(out_dir.rglob("*.mp4"))
        vid = mp4s[-1]
        # mux the audio in (LivePortrait is video-driven, no audio)
        final = out_dir / "final.mp4"
        subprocess.run([os.environ.get("FFMPEG", "ffmpeg"), "-y", "-i", str(vid),
                        "-i", str(audio_wav), "-c:v", "copy", "-c:a", "aac",
                        "-shortest", str(final)], check=True, capture_output=True)
        return final.read_bytes()
    # SadTalker
    subprocess.run(["python", f"{SADTALKER_DIR}/inference.py",
                    "--source_image", str(reference_png),
                    "--driven_audio", str(audio_wav),
                    "--result_dir", str(out_dir),
                    "--still", "--preprocess", "full", "--enhancer", "gfpgan"],
                   check=True, capture_output=True, cwd=SADTALKER_DIR)
    mp4s = sorted(out_dir.rglob("*.mp4"))
    if not mp4s:
        raise ValueError("talking-head model produced no video")
    return mp4s[-1].read_bytes()


# --------------------------------------------------------------------------- #
#  evaluate / voice  (F5-TTS synth with the finetuned checkpoint)            #
# --------------------------------------------------------------------------- #

_f5_cache: dict[str, object] = {}


def _load_f5(ckpt_file: str, vocab_file: str, exp_name: str):
    if ckpt_file not in _f5_cache:
        from f5_tts.api import F5TTS  # local import: only needed once a voice model exists
        _f5_cache[ckpt_file] = F5TTS(model=exp_name, ckpt_file=ckpt_file, vocab_file=vocab_file)
    return _f5_cache[ckpt_file]


def _voice_pointer(model_ref: str) -> dict:
    p = WORK / "models" / f"{model_ref}.f5.json"
    if not p.exists():
        raise ValueError(f"voice model {model_ref} not found on this worker — train it here")
    return json.loads(p.read_text())


def _f5_synth(model_ref: str, text: str) -> bytes:
    ptr = _voice_pointer(model_ref)
    if not ptr.get("ref_wav"):
        raise ValueError(f"voice model {model_ref} has no reference clip recorded — retrain")
    tts = _load_f5(ptr["ckpt"], ptr["vocab"], ptr.get("exp_name", F5_EXP_NAME))
    out = WORK / "tmp" / f"{uuid.uuid4().hex}.wav"
    tts.infer(ref_file=ptr["ref_wav"], ref_text=ptr["ref_text"], gen_text=text, file_wave=str(out))
    data = out.read_bytes()
    out.unlink(missing_ok=True)
    return data


def _profile_dir(model_ref: str) -> pathlib.Path:
    d = WORK / "faces" / model_ref
    if not (d / "meta.json").exists():
        raise ValueError(f"face profile {model_ref} not found on this worker — train it here")
    return d


def _driving_clip_for(identity_dir: pathlib.Path, perf_ref: str) -> pathlib.Path | None:
    """A face_identity profile has no driving clip of its own (_train_face
    only extracts one for face_performance/lipsync). If the app trained
    face_performance/lipsync SEPARATELY from face_identity, prefer that
    profile's driving.mp4 — falling back to the identity profile's own
    (present when it WAS trained as face_performance/lipsync directly)."""
    if perf_ref:
        try:
            perf_drv = _profile_dir(perf_ref) / "driving.mp4"
            if perf_drv.exists():
                return perf_drv
        except ValueError:
            pass
    own_drv = identity_dir / "driving.mp4"
    return own_drv if own_drv.exists() else None


def _audio_for(script_text: str) -> pathlib.Path:
    """F5-TTS synth with the latest trained voice if there is one, else a mock tone."""
    models = sorted((WORK / "models").glob("voice-*.f5.json"))
    out = WORK / "tmp" / f"{uuid.uuid4().hex}.wav"
    if models:
        model_ref = models[-1].name[: -len(".f5.json")]
        out.write_bytes(_f5_synth(model_ref, script_text))
    else:
        out.write_bytes(_mock_wav(max(2.0, len(script_text.split()) / 2.3),
                                  max(1, len(script_text.split()))))
    return out


def do_evaluate(payload: dict, _set_stage=None):
    profile = payload.get("profile")
    if profile == "voice":
        data = _f5_synth(str(payload.get("modelRef") or ""), str(payload.get("scriptText", "")))
        return {"result": {"scores": {}, "note": "listen and score against §4",
                           "kind": "EXPERIMENTAL"}}, data, "audio/wav"

    if profile == "speaking_style":
        return {"result": {"scores": {}, "note": "not implemented"}}, _mock_wav(3, 6), "audio/wav"

    # face_identity / face_performance / lipsync -> visual preview
    d = _profile_dir(str(payload.get("modelRef") or ""))
    ref = d / "reference.png"
    if profile == "face_identity":
        # the point of this preview: "is this really me, not a cartoon?"
        return {"result": {"scores": {}, "note": "this is a real frame from your video — "
                           "check identity, skin, lighting (§4)", "kind": "EXPERIMENTAL"}}, \
               ref.read_bytes(), "image/png"
    audio = _audio_for(str(payload.get("scriptText", "")))
    drv = _driving_clip_for(d, str(payload.get("perfRef") or ""))
    video = _talking_head(ref, audio, drv)
    return {"result": {"scores": {}, "note": "watch: identity held? mouth matches Swahili? "
                       "believable as a real recording? (§4)", "kind": "EXPERIMENTAL"}}, \
           video, "video/mp4"


def do_voice(payload: dict, _set_stage=None):
    ref = str(payload.get("modelRef") or "")
    if not ref:
        raise ValueError("no PRODUCTION voice model — train one in the Training Studio and "
                         "promote it, or switch GPU provider back to local-mock")
    data = _f5_synth(ref, str(payload.get("text", "")))
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
    ref = str(payload.get("modelRef") or "")
    if ref:
        d = _profile_dir(ref)
        return (d / "reference.png").read_bytes(), "image/png", {"modelRef": ref, "real": True}
    # no trained face profile yet -> obvious mock (brief §0)
    w = int(payload.get("width", 720)); h = int(payload.get("height", 900))
    return _mock_png(w, h), "image/png", {"width": w, "height": h, "mock": True}


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
    audio_b64 = payload.get("audioB64")
    if not audio_b64:
        raise ValueError("lipsync needs audioB64")
    ap = WORK / "tmp" / f"{uuid.uuid4().hex}.wav"
    ap.write_bytes(base64.b64decode(audio_b64))

    ref_model = str(payload.get("modelRef") or "")
    if ref_model:
        # real talking-head: your trained face + this audio (SadTalker / LivePortrait)
        d = _profile_dir(ref_model)
        drv = _driving_clip_for(d, str(payload.get("perfRef") or ""))
        video = _talking_head(d / "reference.png", ap, drv)
        ap.unlink(missing_ok=True)
        return video, "video/mp4", {"modelRef": ref_model, "real": True, "faceModel": FACE_MODEL}

    # no trained face profile -> obvious mock lip-bar over the sent face
    face_b64 = payload.get("faceB64")
    if not face_b64:
        raise ValueError("no face profile and no faceB64 — train a face profile first")
    w = int(payload.get("width", 720)); h = int(payload.get("height", 900))
    fp = WORK / "tmp" / f"{uuid.uuid4().hex}.png"; fp.write_bytes(base64.b64decode(face_b64))
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
