#!/usr/bin/env bash
# One-time setup for running the Video Studio APP ITSELF (not just the GPU
# worker) on your own machine, inside WSL2 — so it's never subject to
# GitHub Codespaces' idle timeout. The GPU stays fully flexible: this app
# still talks to whichever worker you activate in Settings -> Compute
# profiles (Colab, Kaggle, your own GPU, anything) exactly as before —
# running the app locally does NOT lock you into your local GPU.
#
# Run from the repo root, inside WSL2 Ubuntu (the same one from
# worker/local/setup.sh): bash local-app/setup.sh
set -euo pipefail

echo "== Node.js =="
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
else
  echo "node $(node -v) already installed"
fi

echo "== Installing app dependencies (npm install) =="
npm install

echo "== .env =="
if [ ! -f .env ]; then
  cp .env.example .env
  SECRET="$(node -e "console.log(require('crypto').randomBytes(40).toString('base64url'))")"
  node -e "const fs=require('fs');const p='.env';let s=fs.readFileSync(p,'utf8');s=s.replace(/^SESSION_SECRET=.*/m,'SESSION_SECRET=$SECRET');fs.writeFileSync(p,s)"
  echo "Created .env with a random SESSION_SECRET."
else
  echo ".env already exists — leaving it as is."
fi

if ! grep -q "^APP_PASSWORD_HASH=scrypt:" .env 2>/dev/null; then
  echo
  read -r -s -p "Set your app password now: " PW
  echo
  if [ -n "$PW" ]; then
    HASH_LINE="$(npm run --silent hash-password -- "$PW")"
    node -e "
      const fs = require('fs');
      const p = '.env';
      let s = fs.readFileSync(p, 'utf8');
      const line = process.argv[1];
      if (/^APP_PASSWORD_HASH=.*/m.test(s)) s = s.replace(/^APP_PASSWORD_HASH=.*/m, line);
      else s += (s.endsWith('\n') ? '' : '\n') + line + '\n';
      fs.writeFileSync(p, s);
    " "$HASH_LINE"
    echo "Password set."
  else
    echo "Skipped — run 'npm run hash-password -- \"your-password\"' and paste the"
    echo "APP_PASSWORD_HASH line into .env before starting the app."
  fi
fi

mkdir -p "$HOME/.vs-logs"
echo
echo "Setup done. Start the app with:  bash local-app/start.sh"
