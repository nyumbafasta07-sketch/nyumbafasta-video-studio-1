# FUTURE_FEATURES

Things deliberately **not** being built now. Parked here per `ENGINEERING_BRIEF.md`
§1 and §0. Nothing in this list gets code until it is explicitly pulled out with
a reason recorded in `DECISIONS.md`.

## Out of scope by the brief (§1)

- Automatic B-roll selection / insertion
- Automatic captions / subtitles burn-in
- Automatic music / SFX
- Automatic transitions
- Automatic posting to TikTok / Instagram / YouTube
- Full timeline / NLE editor (CapCut stays the finishing tool)
- Public marketplace
- Public registration / sign-up
- Subscription billing / payments
- Multi-tenant SaaS architecture
- Analytics beyond basic job logs
- Speculative "AI agents"

## Deferred infrastructure (revisit only when a real limit is hit)

- **Supabase / Postgres** instead of local SQLite — only if the founder wants
  multi-device LAN access with concurrent writers. Repo layer is isolated so
  this is a one-file port. (`DECISIONS.md`)
- **Job queue broker** (Redis / RabbitMQ / BullMQ) — only if one-user, one-job-
  at-a-time polling demonstrably can't keep up. (brief §6)
- **Second user / STAFF role / RBAC** — single-user is CONFIRMED (brief §3). A
  second user is a future explicit decision, not something to architect for now.
- **Public hosting / deployment target** — default is "runs locally". LAN access
  from the founder's phone is the only near-term networking case.

## Training Studio (real, but Phase 3+)

The full digital-twin training pipeline (brief §8) — founder video ingestion,
quality scoring, the four profiles (voice / speaking style / face identity /
facial performance), progressive levels L1-L6, training-job versioning and A/B
evaluation — is real and planned, but does not start until the Phase 2 mock
pipeline runs end-to-end and is tested. Architected for from day one (job-state
pattern, `status` vocabulary, storage split raw/processed), implemented per phase.

## Emotion / delivery controls

The Create Video emotion picker (Neutral, Friendly, Excited, Serious,
Professional, Storytelling) exists in the UI now, but any option the chosen
engine cannot actually control reliably must be labelled EXPERIMENTAL and must
not fake the control (brief §5). Full reliable emotion control is Phase 6.
