# DEVELOPMENT

## Commands

| Command | What |
|---|---|
| `npm run dev` | Next.js dev server on :3000 |
| `npm run build` / `npm run start` | production build + serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest — full mock pipeline, no GPU, no network |
| `npm run test:watch` | Vitest watch mode |
| `npm run hash-password -- "pw"` | print an `APP_PASSWORD_HASH` line |
| `npm run worker` | run the optional Python mock GPU worker |

## Layout

See `ARCHITECTURE.md §9`. Short version:

- `src/app/**` — UI routes + API route handlers (all `runtime = "nodejs"`)
- `src/lib/config.ts` — the only place env vars are read
- `src/lib/repo.ts` — the only place SQL is written (swap target = rewrite this)
- `src/lib/providers/**` — the model seams; every one has a `mock` impl
- `src/lib/pipeline/**` — the 8-stage orchestrator + job runner
- `worker/**` — the decoupled compute service (mock reference now)

## Adding a real model (Phase 3+)

1. Add an implementation file under `src/lib/providers/<kind>/<name>.ts` that
   satisfies the interface in `src/lib/providers/types.ts`.
2. Add a `case "<name>":` to the factory in `src/lib/providers/index.ts`.
3. Flip the env var (`VOICE_PROVIDER=<name>`).
4. No UI, orchestrator, DB, or API changes. If you needed one, the seam is wrong
   — fix the seam, not the callers.
5. Record the choice + the rejected alternatives in `DECISIONS.md`; fill in
   `MODEL_EVALUATION.md`, `MODEL_DEPLOYMENT.md`, and the benchmark docs.

## Conventions

- Label every generated output `MOCK` / `EXPERIMENTAL` / `PRODUCTION`. Never blur
  them (brief §0). The `kind` field on provider results carries this.
- Stages must stay idempotent (deterministic output path + an `isDone` check) so
  retry and crash-recovery keep working.
- Never log secrets — `logger.ts` redacts a known set; add to it, don't bypass.
- Keep `storage/` out of git. Nothing generated or uploaded is committed.

## Job lifecycle (local, no broker)

`POST /api/jobs` → `createJob` (QUEUED) → `enqueue()` fires `processJob` on a
microtask. `GET /api/jobs/:id` returns status and also calls `sweep()` to re-pick
jobs stranded by a dev-server restart. The frontend (`JobProgress.tsx`) polls
every 1.5s until a terminal state.
