# Running the app itself on your own machine

This runs the **Video Studio web app** (not the GPU worker — that's
`worker/local/`) on your own Windows PC via WSL2, so it's never subject to
GitHub Codespaces' idle timeout. Your GPU choice is untouched: this app still
connects to whichever worker you activate in **Settings → Compute profiles**
(Colab, Kaggle, your own GPU, anywhere) — running the app locally does not
lock you into your local GPU.

## 1. One-time setup

You already have WSL2 + the repo cloned from setting up `worker/local/`. In
that same Ubuntu terminal:

```bash
cd nyumbafasta-video-studio-1
git checkout training-studio && git pull
bash local-app/setup.sh
```

It installs Node.js if needed, runs `npm install`, creates `.env` with a
random session secret, and asks you to set your app password (or run
`npm run hash-password -- "your-password"` yourself later and paste the
`APP_PASSWORD_HASH=` line into `.env`).

## 2. Start it

```bash
bash local-app/start.sh
```

Safe to re-run — does nothing if it's already up. Prints the URLs you can
use once it's running.

## 3. Reach it from other devices

**On this same PC**: `http://localhost:3000` — done.

**Other devices on the same home WiFi** (phone, laptop): needs WSL2 to share
the Windows host's network. One-time setup on the **Windows** side (not
WSL2) — PowerShell, regular (non-admin) is fine:

1. Create/edit `C:\Users\<you>\.wslconfig`:
   ```ini
   [wsl2]
   networkingMode=mirrored
   ```
2. Restart WSL2 completely: `wsl --shutdown`, then reopen your Ubuntu terminal
   and re-run `bash local-app/start.sh`.
3. Find this PC's LAN IP: Windows Settings → Network & Internet → Wi-Fi →
   your network → Properties → look for "IPv4 address" (something like
   `192.168.1.x`). From your phone (same WiFi), open
   `http://192.168.1.x:3000`.

Needs Windows 11 22H2+ or a recent Windows 10 build. If `networkingMode=mirrored`
doesn't work on your Windows version, the fallback is manually forwarding the
port from Windows to WSL2 — ask if you hit this, it needs a couple of
PowerShell commands run as Administrator every time WSL2's internal IP
changes (usually each reboot), which mirrored mode avoids entirely.

**From anywhere — mobile data, away from home** (recommended over exposing
the port to the whole internet): install **Tailscale** — a private network
between just your own devices, not public.

1. Inside WSL2: `curl -fsSL https://tailscale.com/install.sh | sh` then
   `sudo tailscale up` (opens a login link — sign in with any account,
   Google/GitHub/Microsoft all work, it's free for personal use).
2. Install the Tailscale app on your phone, sign in with the **same**
   account.
3. Run `tailscale ip -4` inside WSL2 — that's a stable private address
   (e.g. `100.x.y.z`) reachable from your phone **anywhere**, over
   `http://100.x.y.z:3000`, without opening anything to the public internet.

## Updating later

```bash
git pull
bash local-app/start.sh   # rebuilds automatically since the build is stale
```
