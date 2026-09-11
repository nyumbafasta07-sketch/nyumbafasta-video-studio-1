#!/usr/bin/env bash
# Starts the real GPU worker on your own machine + a public tunnel to it.
# Run from the repo root, inside WSL2 Ubuntu, after worker/local/setup.sh:
#   bash worker/local/start.sh
#
# Unlike Colab/Kaggle this can just be left running — no forced session
# end, no GPU-hours quota. Keep this terminal open (or run it inside
# `screen`/`tmux` so it survives closing the terminal window).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck disable=SC1091
source "$HOME/vs-venv/bin/activate"

export WORK_DIR="$HOME/vs-work"
export F5TTS_REPO_DIR="$HOME/F5-TTS"
export F5_FINETUNE_DRIVER="$REPO_ROOT/worker/colab/f5_finetune_driver.py"
export SADTALKER_DIR="$HOME/SadTalker"
export FACE_MODEL="${FACE_MODEL:-sadtalker}"
export WHISPER_SIZE="${WHISPER_SIZE:-medium}"
export F5_EPOCHS="${F5_EPOCHS:-100}"
export F5_NUM_WORKERS="${F5_NUM_WORKERS:-2}"

# Reuse the same worker token across restarts (a local machine doesn't get
# a fresh session each run like Colab/Kaggle do) so you don't have to
# re-paste it into Settings every time — delete the file to rotate it.
TOKEN_FILE="$WORK_DIR/gpu_worker_token.txt"
mkdir -p "$WORK_DIR"
if [ -f "$TOKEN_FILE" ]; then
  export GPU_WORKER_TOKEN
  GPU_WORKER_TOKEN="$(cat "$TOKEN_FILE")"
else
  export GPU_WORKER_TOKEN
  GPU_WORKER_TOKEN="$(python3 -c 'import secrets; print(secrets.token_urlsafe(24))')"
  echo "$GPU_WORKER_TOKEN" > "$TOKEN_FILE"
fi
echo "WORKER TOKEN (Settings -> Compute profiles -> Local): $GPU_WORKER_TOKEN"

cd "$REPO_ROOT/worker/colab"   # gpu_worker.py imports ingest.py as a sibling
python3 gpu_worker.py &
WORKER_PID=$!
trap 'kill "$WORKER_PID" 2>/dev/null || true' EXIT
sleep 3

echo "Starting tunnel — copy the https://xxx.trycloudflare.com URL below"
echo "into Settings -> Compute profiles -> Local, alongside the token above."
cloudflared tunnel --url http://localhost:8800
