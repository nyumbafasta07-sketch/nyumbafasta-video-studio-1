# NyumbaFasta Video Studio

Private, single-user tool that turns a Tanzanian Swahili script into a raw
talking-head MP4 (9:16, green screen) for finishing in CapCut. Not a SaaS, not
multi-user, not hosted — it runs on the founder's own machine.

**Status: Phase 2 — mock skeleton.** The whole pipeline runs end-to-end with
**zero GPU** and deliberately fake voice / face / lip-sync. Real models come in
Phases 3–6, behind unchanged interfaces.

```
Script → (mock) voice → (mock) avatar → (mock) lip-sync → green-screen render → MP4
```

## Quick start

```bash
npm install
cp .env.example .env
npm run hash-password -- "your-password"   # paste the printed line into .env
npm run dev                                # http://localhost:3000
```

Full instructions: [SETUP.md](./SETUP.md).

## Documents

| File | What |
|---|---|
| [ENGINEERING_BRIEF.md](./ENGINEERING_BRIEF.md) | The single source of truth (scope, principles, phases) |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | How it's built; the model seams |
| [ROADMAP.md](./ROADMAP.md) | Phases 1–6 and their gates |
| [DECISIONS.md](./DECISIONS.md) | Every non-trivial choice + rejected alternatives |
| [FUTURE_FEATURES.md](./FUTURE_FEATURES.md) | Deliberately not built yet |
| [SECURITY.md](./SECURITY.md) | Secrets, auth, private-asset rules |
| [SETUP.md](./SETUP.md) · [DEVELOPMENT.md](./DEVELOPMENT.md) | Run it · work on it |
| [MODEL_EVALUATION.md](./MODEL_EVALUATION.md) · [MODEL_DEPLOYMENT.md](./MODEL_DEPLOYMENT.md) | Phase 3+ placeholders |

## Tests

```bash
npm test      # full mock pipeline, no GPU, no network
```
