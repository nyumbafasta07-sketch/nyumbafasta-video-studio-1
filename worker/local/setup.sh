#!/usr/bin/env bash
# One-time setup for running the REAL GPU worker on your own machine, via
# WSL2 on Windows (see worker/local/README.md for the Windows-side steps
# that must happen BEFORE this script — enabling WSL2, installing Ubuntu,
# and having a current NVIDIA driver on the Windows host).
#
# Run from the repo root, inside WSL2 Ubuntu:  bash worker/local/setup.sh
set -euo pipefail

echo "== Checking the GPU is visible inside WSL2 =="
if ! nvidia-smi -L; then
  echo
  echo "No GPU visible. This almost always means the Windows-side NVIDIA"
  echo "driver isn't installed/current, or WSL2 needs a restart:"
  echo "  1. On Windows: install/update the driver from nvidia.com (any"
  echo "     recent Game Ready or Studio driver includes WSL2 CUDA support"
  echo "     — do NOT install a separate Linux driver inside WSL2)."
  echo "  2. In PowerShell (Windows, not WSL): wsl --shutdown"
  echo "  3. Reopen your WSL2 terminal and re-run this script."
  exit 1
fi

echo "== Installing system packages =="
sudo apt-get update -qq
sudo apt-get install -y -qq ffmpeg espeak-ng python3-venv python3-pip git wget

echo "== Creating a Python virtualenv (~/vs-venv) =="
python3 -m venv "$HOME/vs-venv"
# shellcheck disable=SC1091
source "$HOME/vs-venv/bin/activate"
pip install -q --upgrade pip

echo "== Installing voice stack (faster-whisper + F5-TTS) =="
pip install -q faster-whisper soundfile
# A clean, single opencv install — mixing opencv-python + opencv-python-
# headless is a known conflict that broke face_identity training on Colab
# this same week (see gpu_worker.py's comments). Keep it to one package.
pip install -q --no-cache-dir opencv-python-headless

git clone -q https://github.com/SWivid/F5-TTS "$HOME/F5-TTS" 2>/dev/null || \
  (cd "$HOME/F5-TTS" && git pull -q)
(cd "$HOME/F5-TTS" && pip install -q -e .)

echo "voice stack installed."
read -r -p "Also install face/lip-sync (SadTalker, ~10-15 min download)? [y/N] " yn
if [[ "$yn" == "y" || "$yn" == "Y" ]]; then
  git clone -q https://github.com/OpenTalker/SadTalker "$HOME/SadTalker" 2>/dev/null || \
    (cd "$HOME/SadTalker" && git pull -q)
  (cd "$HOME/SadTalker" && pip install -q -r requirements.txt && bash scripts/download_models.sh)
  # SadTalker's deps (basicsr/facexlib/gfpgan) pull in opencv-python (full),
  # clobbering the headless one above — force a clean single install again.
  pip uninstall -y -q opencv-python opencv-contrib-python \
    opencv-python-headless opencv-contrib-python-headless 2>/dev/null || true
  pip install -q --no-cache-dir opencv-python-headless
  echo "face/lip-sync stack installed."
fi

echo "== Installing cloudflared (for a public tunnel to this machine) =="
if [ ! -f /usr/local/bin/cloudflared ]; then
  wget -q -O /tmp/cloudflared \
    https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
  sudo mv /tmp/cloudflared /usr/local/bin/cloudflared
  sudo chmod +x /usr/local/bin/cloudflared
fi

mkdir -p "$HOME/vs-work"
echo
echo "Setup done. Start the worker with:  bash worker/local/start.sh"
