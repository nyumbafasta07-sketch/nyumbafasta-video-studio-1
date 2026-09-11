# SECURITY

Scope: a **private, single-user, locally-run** tool (`ENGINEERING_BRIEF.md` §3,
§10). Threat model is small but the founder's face / voice / scripts / trained
models are sensitive personal assets. The rules below are non-negotiable.

## Secrets

- No secrets in source code, ever. Env vars only.
- `.env.example` is committed; `.env` and `.env.local` are git-ignored and never
  committed.
- Secrets in use: `SESSION_SECRET` (cookie HMAC), `APP_PASSWORD_HASH` (scrypt
  hash of the app password), `GPU_WORKER_URL` / `GPU_WORKER_TOKEN`.
- Logs never contain the password, its hash, the session secret, cookie values,
  or provider tokens (`src/lib/logger.ts` redacts).
- The GPU **worker token** can also be set at runtime from Settings → Compute so
  the founder can switch workers (Colab / Kaggle / local box) without editing
  `.env`. When set that way it lives in the local, git-ignored SQLite file
  (`*.sqlite` in `.gitignore`) — still never in source, never committed. The API
  returns it only as a boolean (`gpuWorkerTokenSet`), never the value, and it is
  never logged. Env `GPU_WORKER_TOKEN` remains the default when nothing is set
  in the UI. (`DECISIONS.md`)

## Auth / access

- Everything except `/login`, `/api/auth/login`, the manifest, and static assets
  is gated by `middleware.ts`.
- Session cookie: `HttpOnly`, `SameSite=Lax`, `Secure` when not on localhost,
  HMAC-signed, time-limited (`SESSION_TTL_HOURS`, default 720).
- Password verification is constant-time (`crypto.timingSafeEqual`) against a
  scrypt hash. No plaintext password stored anywhere.
- No registration, no password-reset-by-email, no roles. Rotating the password =
  regenerate `APP_PASSWORD_HASH` (see `SETUP.md`) and restart.
- Failed-login attempts are rate-limited in-process (simple sliding window).

## Assets and network

- No private voice / face / video asset is served from an unauthenticated URL.
  Downloads go through `/api/jobs/[id]/download`, which requires a valid session
  and checks the asset belongs to a real job.
- Raw filesystem paths are never returned to the client.
- Default bind is localhost. LAN exposure (`-H 0.0.0.0`) is opt-in and documented
  as "only on a network you trust"; the password gate is what protects it.
- No model file is ever placed on a public URL or in a public repo.
- The GPU worker (Phase 3+) is reachable only from the Next.js app, over the LAN
  or an authenticated tunnel, with a bearer token. The browser never calls it.

## Data handling

- `storage/` is git-ignored in full. Nothing generated or uploaded is committed.
- Phase 3+: raw founder uploads are kept in `storage/raw/` and never
  auto-deleted; cleaned/derived data lives separately in `storage/processed/`.
- Only videos explicitly marked "Add to Training Dataset" ever become training
  data — no silent ingestion (brief §8.2).
- Secure deletion + version retention for models and datasets is a Phase 3
  requirement (brief §8.5, §8.7).

## Dependencies

- Prefer the standard library (`node:sqlite`, `node:crypto`) over third-party
  packages for anything security-relevant.
- `ffmpeg-static` ships a pinned binary; pin its version in `package.json`.

## Static analysis (Semgrep)

`npm run security-scan` runs Semgrep (security-audit + secrets + OWASP Top 10 +
React + Next.js rulesets) against the whole repo. Installed automatically in a
fresh Codespace (`.devcontainer/devcontainer.json`'s `postCreateCommand`);
elsewhere: `pip install --user semgrep`.

Last full run (2026-09-11, training-studio branch vs main): one real finding,
fixed — `src/app/login/page.tsx`'s post-login redirect assigned an
unvalidated `?next=` query param straight to `window.location.href`, which a
`javascript:` URI could turn into script execution in the app's own origin
right after a real login. Fixed by requiring `next` to be an internal path
(`startsWith("/")`, not `startsWith("//")`) before using it. Semgrep still
flags the line (its pattern match can't see the validation branch) — that's
a known false positive post-fix, not an open issue.
Other findings (SHA1 used for content-addressing, not crypto; `FFMPEG` env
var reaching `subprocess.run`) were reviewed and are not exploitable in this
app's threat model — see git history on that date for the full reasoning.

## Reporting

Single maintainer. If a security issue is found, fix before any LAN exposure and
record the fix in `DECISIONS.md` if it changes architecture.
