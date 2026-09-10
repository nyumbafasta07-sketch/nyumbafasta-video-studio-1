#!/usr/bin/env python3
"""
Training-data ingestion — brief §8.2. EXPERIMENTAL, GPU helps (Whisper).

Turns the founder's authorized videos into:
  dataset/wavs/*.wav          speech clips, 2.5–12 s, mono 22.05 kHz
  dataset/metadata.csv        LJSpeech-style  <id>|<text>
  dataset/metadata.jsonl      richer rows (duration, source, asr, quality)
  dataset/faces/*.jpg         sampled face crops (for the Phase 4 face profile)
  report.json                 per-video quality score + status

Model-agnostic: this output feeds whichever TTS we fine-tune AND the face
identity profile. Originals are never modified or deleted — only their paths
and sha1 are recorded (brief §8.2, §8.7).

Pipeline per video (brief §8.2):
  extract audio → split on silence → transcribe (Whisper) → align → quality
  score → (frames → detect face → face score) → add to dataset

Usage:
  python ingest.py --videos ./videos --out ./out [--whisper small] [--lang sw]
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import pathlib
import re
import subprocess
import sys

SR = 22050
MIN_SEC = 2.5
MAX_SEC = 12.0
VIDEO_EXT = {".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v", ".wav", ".m4a", ".mp3"}


def sh(cmd: list[str]) -> str:
    return subprocess.run(cmd, capture_output=True, text=True).stderr


def sha1(path: pathlib.Path) -> str:
    h = hashlib.sha1()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def extract_audio(src: pathlib.Path, dst: pathlib.Path) -> None:
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(src), "-vn", "-ac", "1", "-ar", str(SR), str(dst)],
        check=True, capture_output=True,
    )


def duration(path: pathlib.Path) -> float:
    err = sh(["ffmpeg", "-i", str(path)])
    m = re.search(r"Duration:\s*(\d+):(\d+):(\d+\.\d+)", err)
    if not m:
        return 0.0
    return int(m[1]) * 3600 + int(m[2]) * 60 + float(m[3])


def silence_windows(wav: pathlib.Path, noise_db: int = -30, min_sil: float = 0.4):
    """Return (start, end) speech spans between detected silences."""
    err = sh(["ffmpeg", "-i", str(wav), "-af",
              f"silencedetect=noise={noise_db}dB:d={min_sil}", "-f", "null", "-"])
    starts = [float(x) for x in re.findall(r"silence_start:\s*([\d.]+)", err)]
    ends = [float(x) for x in re.findall(r"silence_end:\s*([\d.]+)", err)]
    total = duration(wav)
    # speech = complement of the silence intervals
    sil = sorted(zip(starts, ends + [total] * (len(starts) - len(ends))))
    spans, cur = [], 0.0
    for s, e in sil:
        if s - cur > 0.3:
            spans.append((cur, s))
        cur = e
    if total - cur > 0.3:
        spans.append((cur, total))
    # enforce length bounds: drop < MIN, hard-cut > MAX
    out = []
    for s, e in spans:
        while e - s > MAX_SEC:
            out.append((s, s + MAX_SEC))
            s += MAX_SEC
        if e - s >= MIN_SEC:
            out.append((s, e))
    return out


def cut(wav: pathlib.Path, s: float, e: float, dst: pathlib.Path) -> None:
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(wav), "-ss", f"{s:.3f}", "-to", f"{e:.3f}",
         "-ac", "1", "-ar", str(SR), str(dst)],
        check=True, capture_output=True,
    )


def mean_volume_db(wav: pathlib.Path) -> float:
    err = sh(["ffmpeg", "-i", str(wav), "-af", "volumedetect", "-f", "null", "-"])
    m = re.search(r"mean_volume:\s*(-?[\d.]+)\s*dB", err)
    return float(m[1]) if m else -99.0


# --------------------------------------------------------------------------- #

_whisper = None


def transcribe(wav: pathlib.Path, model_size: str, lang: str) -> tuple[str, float]:
    global _whisper
    if _whisper is None:
        from faster_whisper import WhisperModel  # type: ignore
        import torch  # noqa

        dev = "cuda" if _cuda() else "cpu"
        _whisper = WhisperModel(model_size, device=dev,
                                compute_type="float16" if dev == "cuda" else "int8")
    segs, _info = _whisper.transcribe(str(wav), language=lang, vad_filter=True)
    parts, logp = [], []
    for s in segs:
        parts.append(s.text.strip())
        logp.append(getattr(s, "avg_logprob", 0.0))
    text = re.sub(r"\s+", " ", " ".join(parts)).strip()
    conf = float(sum(logp) / len(logp)) if logp else -9.0
    return text, conf


def _cuda() -> bool:
    try:
        import torch

        return torch.cuda.is_available()
    except Exception:
        return False


# --------------------------------------------------------------------------- #

_facedet = None


def face_scores(video: pathlib.Path, out_dir: pathlib.Path, n: int = 12):
    """Sample n frames, return (found_ratio, mean_face_frac, mean_sharpness, saved)."""
    global _facedet
    try:
        import cv2  # type: ignore
        import mediapipe as mp  # type: ignore
    except Exception as exc:  # noqa: BLE001
        return {"error": f"face libs unavailable: {exc}"}

    if _facedet is None:
        _facedet = mp.solutions.face_detection.FaceDetection(
            model_selection=1, min_detection_confidence=0.5)

    cap = cv2.VideoCapture(str(video))
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 0
    if total <= 0:
        return {"error": "no frames"}
    idxs = [int(total * (i + 0.5) / n) for i in range(n)]
    found, fracs, sharps, saved = 0, [], [], 0
    for k, fi in enumerate(idxs):
        cap.set(cv2.CAP_PROP_POS_FRAMES, fi)
        ok, frame = cap.read()
        if not ok:
            continue
        h, w = frame.shape[:2]
        res = _facedet.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        if not res.detections:
            continue
        found += 1
        box = res.detections[0].location_data.relative_bounding_box
        fracs.append(max(0.0, min(1.0, box.height)))
        x, y = max(0, int(box.xmin * w)), max(0, int(box.ymin * h))
        cw, ch = int(box.width * w), int(box.height * h)
        crop = frame[y:y + ch, x:x + cw]
        if crop.size:
            sharps.append(cv2.Laplacian(cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY),
                                        cv2.CV_64F).var())
            if k < 6:
                cv2.imwrite(str(out_dir / f"{video.stem}_{k}.jpg"), crop)
                saved += 1
    cap.release()
    return {
        "found_ratio": round(found / max(1, len(idxs)), 2),
        "mean_face_frac": round(sum(fracs) / len(fracs), 3) if fracs else 0.0,
        "mean_sharpness": round(sum(sharps) / len(sharps), 1) if sharps else 0.0,
        "faces_saved": saved,
    }


# --------------------------------------------------------------------------- #

def classify(speech_sec: float, n_clips: int, vol_db: float, face: dict) -> tuple[int, str]:
    score = 10
    notes = []
    if vol_db < -34:
        score -= 3
        notes.append("TOO MUCH BACKGROUND NOISE / low level")
    if speech_sec < 60:
        score -= 3
        notes.append("NEEDS MORE SPEECH (<60s usable)")
    if n_clips < 8:
        score -= 1
    ff = face.get("found_ratio", 0.0)
    frac = face.get("mean_face_frac", 0.0)
    if "error" not in face:
        if ff < 0.5 or frac < 0.12:
            score -= 3
            notes.append("FACE NOT CLEAR ENOUGH")
        if face.get("mean_sharpness", 0) and face["mean_sharpness"] < 40:
            score -= 2
            notes.append("FACE BLURRY")
    score = max(1, score)
    status = "GOOD FOR TRAINING" if score >= 7 and not notes else (
        "; ".join(notes) if notes else "USABLE")
    return score, status


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--videos", required=True)
    ap.add_argument("--out", default="./out")
    ap.add_argument("--whisper", default="small")
    ap.add_argument("--lang", default="sw")
    a = ap.parse_args()

    vroot = pathlib.Path(a.videos)
    out = pathlib.Path(a.out)
    ds = out / "dataset"
    (ds / "wavs").mkdir(parents=True, exist_ok=True)
    (ds / "faces").mkdir(parents=True, exist_ok=True)
    (out / "work").mkdir(parents=True, exist_ok=True)

    vids = sorted(p for p in vroot.iterdir() if p.suffix.lower() in VIDEO_EXT)
    if not vids:
        sys.exit(f"no media in {vroot}")

    meta_csv = open(ds / "metadata.csv", "w", newline="", encoding="utf-8")
    meta_jsonl = open(ds / "metadata.jsonl", "w", encoding="utf-8")
    w = csv.writer(meta_csv, delimiter="|")
    report = []
    total_clips = 0

    for v in vids:
        print(f"\n=== {v.name} ===")
        full_wav = out / "work" / f"{v.stem}.wav"
        extract_audio(v, full_wav)
        vol_db = mean_volume_db(full_wav)
        spans = silence_windows(full_wav)
        print(f"  {len(spans)} candidate clips, mean volume {vol_db:.1f} dB")

        kept, speech_sec = 0, 0.0
        for i, (s, e) in enumerate(spans):
            clip_id = f"{v.stem}_{i:04d}"
            clip = ds / "wavs" / f"{clip_id}.wav"
            cut(full_wav, s, e, clip)
            text, conf = transcribe(clip, a.whisper, a.lang)
            if len(text) < 3 or conf < -1.2:
                clip.unlink(missing_ok=True)
                continue
            w.writerow([f"wavs/{clip_id}.wav", text])
            meta_jsonl.write(json.dumps({
                "id": clip_id, "wav": f"wavs/{clip_id}.wav", "text": text,
                "dur": round(e - s, 2), "asr_conf": round(conf, 3),
                "source": v.name,
            }, ensure_ascii=False) + "\n")
            kept += 1
            speech_sec += e - s
        total_clips += kept

        face = face_scores(v, ds / "faces") if v.suffix.lower() in {
            ".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v"} else {"error": "audio-only"}
        score, status = classify(speech_sec, kept, vol_db, face)
        print(f"  kept {kept} clips ({speech_sec:.0f}s speech) — score {score}/10 — {status}")
        report.append({
            "video": v.name, "sha1": sha1(v), "clips": kept,
            "speech_seconds": round(speech_sec, 1), "mean_volume_db": round(vol_db, 1),
            "face": face, "score": score, "status": status,
        })

    meta_csv.close()
    meta_jsonl.close()
    (out / "report.json").write_text(json.dumps({
        "clips_total": total_clips,
        "speech_seconds_total": round(sum(r["speech_seconds"] for r in report), 1),
        "videos": report,
    }, indent=2, ensure_ascii=False))
    print(f"\nDONE — {total_clips} clips, "
          f"{sum(r['speech_seconds'] for r in report):.0f}s speech -> {ds}")
    print("Review dataset/metadata.csv (fix any bad transcripts) before fine-tuning.")
    for r in report:
        print(f"  {r['video']:40s} {r['score']}/10  {r['status']}")


if __name__ == "__main__":
    main()
