# Real GPU worker on your own Windows + NVIDIA machine

Same worker code as Colab/Kaggle (`worker/colab/gpu_worker.py`), running on
your own NVIDIA GPU via **WSL2** — the officially-supported way NVIDIA lets
CUDA run inside Windows. No notebook, no session limits, no "user limit"
quota fights. You keep it running as long as you want.

Every bug we hit and fixed on Colab this week (mediapipe, Piper, the OpenCV
dual-install conflict, the 16-dataloader-worker OOM) is fixed in the shared
code, not Colab-specific — none of it recurs here.

## 1. Windows-side setup (do this first, in Windows — not WSL)

1. **Update your NVIDIA driver**: [nvidia.com/drivers](https://www.nvidia.com/Download/index.aspx)
   — any recent Game Ready or Studio driver includes WSL2 CUDA support built
   in. You do **not** install a separate Linux driver inside WSL2 — that's
   the one thing that trips people up.
2. **Install WSL2 + Ubuntu**: open PowerShell **as Administrator** and run:
   ```powershell
   wsl --install -d Ubuntu
   ```
   Restart Windows if it asks you to. This installs WSL2 (not the older,
   unsupported WSL1) with Ubuntu by default on current Windows.
3. Open **Ubuntu** from the Start menu — it'll ask you to create a Linux
   username/password on first launch (separate from your Windows login,
   anything you like).

## 2. Inside the Ubuntu (WSL2) terminal

Check the GPU is visible first — this is the one step most likely to need a
retry (driver not updated yet, or WSL needs `wsl --shutdown` + reopen):
```bash
nvidia-smi -L
```
You should see your GPU's name. If not, see the troubleshooting note in
`setup.sh` — don't proceed until this works.

Get the code and run setup (one-time; the face/lip-sync install is a large,
optional download):
```bash
git clone https://github.com/nyumbafasta07-sketch/nyumbafasta-video-studio-1
cd nyumbafasta-video-studio-1
git checkout training-studio
bash worker/local/setup.sh
```

## 3. Start the worker (every time you want to use it)

```bash
bash worker/local/start.sh
```
This prints a **WORKER TOKEN** (once — reused on later restarts) and then a
`https://xxxx.trycloudflare.com` **tunnel URL** (a new one each restart).
Paste both into the app: **Settings → Compute profiles → Local → Hifadhi**,
then **Washa Local**.

Leave this terminal open while you use the app. To keep it running after
closing the terminal, start it inside `tmux` or `screen` first:
```bash
tmux new -s worker
bash worker/local/start.sh
# Ctrl+B then D to detach — reattach later with: tmux attach -t worker
```

## Updating later

Colab needed a fragile self-contained-notebook trick because `git clone`
inside a Colab session was unreliable. Here you have a real clone, so
updates are just:
```bash
cd nyumbafasta-video-studio-1
git pull
```
No re-syncing anything — `start.sh` always runs whatever's currently in
`worker/colab/gpu_worker.py`.
