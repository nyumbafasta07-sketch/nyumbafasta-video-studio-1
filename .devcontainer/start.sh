#!/usr/bin/env bash
# Auto-start the Video Studio when the Codespace starts, so the same private
# forwarded URL (…-3000.app.github.dev) just works. Runs in the background;
# never blocks Codespace startup.
set -u
cd "$(dirname "$0")/.."

# one-time: create .env from the template with a random session secret
if [ ! -f .env ]; then
  cp .env.example .env
  SECRET="$(node -e "console.log(require('crypto').randomBytes(40).toString('base64url'))")"
  # portable in-place edit
  node -e "const fs=require('fs');const p='.env';let s=fs.readFileSync(p,'utf8');s=s.replace(/^SESSION_SECRET=.*/m,'SESSION_SECRET=$SECRET');fs.writeFileSync(p,s)"
  echo ">> Created .env. Set your password:  npm run hash-password -- \"your-password\"  then paste the line into .env and restart the server." >&2
fi

# already running?
if curl -s -o /dev/null --max-time 2 http://localhost:3000/login; then
  echo ">> Video Studio already up on :3000" >&2
  exit 0
fi

mkdir -p "$HOME/.vs-logs"
nohup npm run dev > "$HOME/.vs-logs/dev.log" 2>&1 &
echo ">> Video Studio starting on :3000 (logs: ~/.vs-logs/dev.log)" >&2
