#!/usr/bin/env bash
# Starts the Video Studio app on your own machine (production build — more
# stable than `npm run dev` for something meant to stay running). Safe to
# run repeatedly; does nothing if it's already up.
# Run from the repo root, inside WSL2: bash local-app/start.sh
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "No .env found — run 'bash local-app/setup.sh' first." >&2
  exit 1
fi

if curl -s -o /dev/null --max-time 2 http://localhost:3000/login; then
  echo ">> Already running on :3000"
else
  echo "== Building (only needed after code changes; skips fast if unchanged) =="
  npm run build
  mkdir -p "$HOME/.vs-logs"
  nohup npm run start -- --hostname 0.0.0.0 > "$HOME/.vs-logs/app.log" 2>&1 &
  disown
  echo ">> Starting on :3000 (logs: ~/.vs-logs/app.log)"
  for _ in $(seq 1 20); do
    sleep 1
    curl -s -o /dev/null --max-time 2 http://localhost:3000/login && break
  done
fi

WSL_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo
echo "On THIS machine:            http://localhost:3000"
echo "Same WiFi, other devices:   http://<this-PC's-LAN-IP>:3000"
echo "  (WSL2 internal IP is $WSL_IP — from Windows this usually just works"
echo "   if WSL2 'mirrored' networking is on; otherwise see local-app/README.md)"
echo "From anywhere (phone etc):  set up Tailscale — see local-app/README.md"
