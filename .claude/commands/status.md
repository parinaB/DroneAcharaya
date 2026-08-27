---
description: Summarize recent changes across MVEM, ML, and visualization for a standup-style update
---

Produce a standup-style summary of recent work across the three subsystems.
Read-only — do not modify anything.

1. Run `git log --oneline -20` and `git status` to see recent commits and
   any uncommitted work.
2. Bucket recent commits (say, last 7 days unless the user specifies a
   different window) by subsystem based on changed paths:
   - **MVEM/physics** — `simulation/`, `contract/environment-schema.yaml`,
     `contract/parameter-source-table.csv`
   - **ML** — `ml/`, `contract/health-parameter-registry.md`,
     `contract/failure-mode-matrix.csv`
   - **Serving** — `backend/`
   - **Visualization** — `frontend/`, and `unreal/` if it exists
   - **Contract/docs** — `contract/telemetry-schema.yaml`, `docs/`
3. For each bucket with activity: 2-4 bullet points, who (from commit
   author) did what, referencing file paths. Skip empty buckets.
4. Flag anything that looks blocking: uncommitted changes older than a day,
   a contract file (`contract/*.yaml`, `*.csv`) changed without a
   corresponding update in the consumers listed in the root `CLAUDE.md`
   naming-conventions section, or a subsystem with no activity in the
   window.
5. Close with a short "asks" section — anything that looks like it needs
   another team member's input before it can proceed (e.g. a schema change
   awaiting sign-off, per `contract/README.md`'s open-decisions list).
