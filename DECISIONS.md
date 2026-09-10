# DECISIONS

Every non-trivial architectural decision. Format:

```
Decision: <what was decided>
Reason:   <why, what alternative was rejected and why>
```

---

Decision: Merged spec `ENGINEERING_BRIEF.md` is the single source of truth.
Reason:   Three original specs overlapped and could drift. One canonical file
          per topic removes contradiction. The brief itself mandates this.

---

Decision: Reuse Next.js (App Router) + TypeScript for the web/app layer.
Reason:   Founder already runs NyumbaFasta on this stack; a second toolchain
          is pure overhead for a solo maintainer. Rejected: separate SPA +
          standalone API server (more moving parts, no benefit at this scale).
          Pinned to Next.js 14 to match the founder's existing project rather
          than tracking latest.

---

Decision: Phase 2 persistence = SQLite via Node's built-in `node:sqlite`, with
          assets on the local filesystem under `storage/`. NOT Supabase yet.
Reason:   CHALLENGE to brief §6. The brief's own constraints (§3: "runs
          locally", "the default answer is runs locally, not deploy it
          somewhere"; §2.5: "simple over impressive") argue against requiring
          Supabase for a single-user local tool. Supabase means either a hosted
          cloud project (a cloud dependency the brief wants to avoid) or a local
          Supabase CLI + Docker stack (heavy setup for one user). `node:sqlite`
          needs zero external services, zero Docker, zero native compilation —
          `npm run dev` just works on the founder's CPU-only Codespace.
          Mitigation / reversibility: all DB access goes through a thin repo
          layer (`src/lib/repo.ts`) and the schema is plain portable SQL
          (UUID text ids, ISO timestamps). Moving to Supabase/Postgres later —
          only justified if the founder wants multi-device LAN access with
          concurrent writers — is a mechanical port of one file, not a rewrite.
          Rejected: better-sqlite3 (native build, risky against Python 3.14 /
          node-gyp on this box); Prisma (heavy codegen for 7 tables).
          Founder can override: say the word and the repo layer swaps to
          Supabase with no UI or business-logic changes.
Confirmed: Founder approved SQLite on 2026-09-10. Revisit only if concurrent
          multi-device writes are ever needed.

---

Decision: No standalone job-queue broker. `generation_jobs` table + in-process
          orchestrator; the frontend polls job status.
Reason:   Brief §6 explicitly says start this simple and do not add
          Redis/RabbitMQ until the simple version can't keep up. One user
          generating one video at a time does not need a broker.

---

Decision: Phase 2 mock providers run in-process (TypeScript), selected by
          `GPU_PROVIDER=local-mock`. A separate Python worker exists in
          `worker/` implementing the same job contract but is NOT required to
          satisfy the Phase 2 success criterion.
Reason:   Brief §2.4 "mocks before models" + §3 "zero GPU for Phase 1-2". There
          is no heavy inference to isolate yet, so forcing a second process for
          mocks would only add friction. The Python worker skeleton still gets
          built now so the `GPUProvider` HTTP seam that Phase 3 depends on is
          real and tested against a reference implementation, not invented later.
          Rejected: Python-only worker for mocks too (slower dev loop, more
          setup, no upside while outputs are fake).

---

Decision: Local password gate = one hashed password in env (`APP_PASSWORD_HASH`)
          + HMAC-signed session cookie. No auth library, no user table.
Reason:   Brief §3 "CONFIRMED: single-user only ... a simple local
          password/session gate is enough. No ADMIN/STAFF distinction, no RBAC."
          Rejected: NextAuth / Supabase Auth / Lucia (all solve multi-user
          problems this project explicitly does not have).

---

Decision: Training Studio (brief §8) built as a mock-first control plane in the
          app now, with all four profiles scaffolded (voice, speaking style,
          face identity, face performance).
Reason:   §8 says the Training Studio starts once the Phase 2 mock pipeline
          works end-to-end — it does. Founder asked to drive training from the
          UI and see where each profile is weak/strong. Same discipline as
          Phase 2: `TrainingProvider` interface + `mock` impl that fakes
          ingestion / dataset build / training / evaluation end-to-end with no
          GPU; a `worker` impl routes to the Python GPU worker later with no UI
          or orchestrator change. New tables (training_videos, datasets,
          training_jobs, model_versions, eval_runs) are justified by §8.5
          (versioning is a hard requirement — never overwrite a working model).
          Rejected: waiting until a real model is picked (the founder needs the
          control surface now to gather/mark data and reason about it);
          building only the voice profile (founder explicitly chose all four).
          The mock trainer's score rises with usable speech and dips past ~45
          min to demonstrate §8.6 "more data is not automatically better".

---

Decision: Mock MP4 render uses the `ffmpeg-static` npm binary (no system ffmpeg).
Reason:   The dev box has no system ffmpeg. `ffmpeg-static` ships a pinned
          binary via npm, keeping "npm install && npm run dev" self-contained.
          The real renderer in later phases keeps the same `VideoRenderer`
          interface, so swapping to a system/GPU ffmpeg build is config-only.
