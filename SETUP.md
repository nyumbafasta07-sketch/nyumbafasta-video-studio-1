# SETUP

Local, single-user. No hosting, no cloud account required for Phase 2.

## Requirements

- Node.js **≥ 22.5** (uses the built-in `node:sqlite`). `node -v` to check.
- No system ffmpeg needed — `ffmpeg-static` is an npm dependency.
- Python 3 only if you want to run the optional GPU worker (`worker/`).

## Install

```bash
npm install
cp .env.example .env
npm run hash-password -- "choose-a-password"     # prints APP_PASSWORD_HASH=...
# paste that line into .env, then set SESSION_SECRET to a long random string
```

Generate a session secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

## Run

```bash
npm run dev        # http://localhost:3000
# or
npm run build && npm run start
```

### GitHub Codespace (stable private URL)

Running the app in a Codespace gives a **fixed private URL** that does not
change for the life of that Codespace:

```
https://<CODESPACE_NAME>-3000.app.github.dev
```

It is GitHub-auth gated (only you can open it) — this is *not* a public
deployment, it is the app running on your machine-in-the-cloud (brief §3).

`.devcontainer/` auto-runs `npm run dev` every time the Codespace starts, so the
URL "just works" when you open the Codespace. One-time setup: `.env` is created
for you with a random `SESSION_SECRET`; set your password once —
`npm run hash-password -- "your-password"`, paste the line into `.env`, then
restart the server (`bash .devcontainer/start.sh` or re-open the Codespace).

The Codespace stops after ~30 min idle and resumes when you open it; the URL is
the same each time. There is deliberately no public/hosted URL — see
`FUTURE_FEATURES.md`.

Log in with the password you hashed. Everything else (mock voice, avatar,
lip-sync, MP4 render) works with zero extra setup.

### Phone / LAN access (optional)

```bash
npm run dev -- -H 0.0.0.0     # then open http://<your-lan-ip>:3000 on the phone
```

Only do this on a network you trust — the password gate is the only protection.

## Data & reset

- SQLite DB: `storage/studio.sqlite`
- Generated files: `storage/projects/...`
- Logs: `storage/logs/jobs.log`

To wipe everything: stop the app and `rm -rf storage/`. It is recreated on next
start.

## Change the password

Re-run `npm run hash-password -- "new-password"`, replace `APP_PASSWORD_HASH` in
`.env`, restart. Existing sessions stay valid until they expire
(`SESSION_TTL_HOURS`); change `SESSION_SECRET` too to invalidate them now.

## Optional: real compute via the Python worker

```bash
python3 worker/worker.py       # :8800, still MOCK output in Phase 2
```

```bash
# .env
GPU_PROVIDER=http
GPU_WORKER_URL=http://localhost:8800
```

See `worker/README.md` and `worker/contract.md`.
