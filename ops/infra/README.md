# Infra setup — bridge, Postgres/Supabase

Design doc for the deployed and local-dev infra. **Grafana, TimescaleDB, and
Docker are all dropped.** Sequence of decisions, each superseding the last:

1. Grafana + TimescaleDB were the original plan (see git history / this
   file's earlier versions).
2. Dropped after the frontend PR merged real dashboard UI
   (`frontend/app/dashboard/`) — it's a better fit for this project's exact
   narrative than generic Grafana panels, at no extra backend cost. Database
   became plain Postgres to match Supabase's free tier (no TimescaleDB
   extension there).
3. **Docker dropped too** — none of the three actual deployment targets
   (Render, Supabase, and presumably Vercel for the frontend) require it.
   `backend/Dockerfile` and `docker-compose.yml` have been deleted; local dev
   is plain `uvicorn app.main:app --reload` against a zero-setup local
   SQLite file.

**Diagram (`infra-diagram.drawio`) is stale** — still shows the old
Docker+TimescaleDB+Grafana topology from decision #1. Needs a full redraw
for the current shape (Render + Supabase + frontend, no containers). Not
done yet.

**`ops/grafana/` is dead** — delete it by hand if it's still present
(untracked, safe to remove).

## Actual deployment target — **live**

Step-by-step runbook: [`RENDER_DEPLOY.md`](RENDER_DEPLOY.md). Blueprint:
[`render.yaml`](../../render.yaml) (repo root).

| Piece | Where | Notes |
| --- | --- | --- |
| Backend (FastAPI + bridge) | **Live** — https://droneacharaya.onrender.com — Render free web service from GitHub, **native Python runtime, no Dockerfile** | Render injects its own `$PORT`; start command is `uvicorn app.main:app --host 0.0.0.0 --port $PORT`, root directory `backend`, build command runs `alembic upgrade head` (which is what created the Supabase tables). |
| Database | **Live** — Supabase free Postgres tier | Plain Postgres, no TimescaleDB extension. **Must use the Session pooler string, not "Direct connection"** — Supabase's direct host resolves to IPv6-only, and Render has no IPv6 egress, so a direct string fails with `Network is unreachable`. All migrations have now run successfully against real Postgres. |
| Frontend | **Live** — https://drone-acharaya.vercel.app — Vercel free tier | Root directory must be set to `frontend`. Needs `NEXT_PUBLIC_API_BASE_URL=https://droneacharaya.onrender.com`, and its origin must be in `backend/app/core/config.py`'s `cors_origins` or the browser blocks every call. |
| Unreal client | External, not built yet (Step 11) | Would hit the backend's REST/WS API on Render, same as any other consumer. |
| ML models | Not deployed as services | Artifact files under `ml/artifacts/`, loaded in-process by `backend/app/core/model_loader.py` — `lstm_rul` (v1), `xgboost_classifier` (v1), and `autoencoder` (v3, paired with `digital_twin` v3) all have real artifacts. Resolved (see below): the runtime-required files for each pinned version (~16MB total) are committed directly in git, so Render's build just pulls them via the normal GitHub checkout — no shared volume or object-storage fetch needed. |

## What's built vs. what's still a placeholder

| Piece | Status |
| --- | --- |
| `backend/app/bridge/` — `FrameSource`/`ReplaySource`/`BridgeService`, `can_framing.py` stub | **Built.** Verified end-to-end with a hand-made 5-frame smoke run (not committed) — telemetry + health-score rows land correctly, health index tracks a decaying fault. |
| `backend/app/db/` — SQLAlchemy models + Alembic migrations | **Built and deployed.** All migrations have run successfully against the real Supabase Postgres (not just local SQLite) as part of Render's build command. |
| `/replay`, `/inference`, `/advisory`, `/ingestion` real endpoints | **Built**, replacing the four one-line stub routers. |
| `data/sample_runs/` (what the bridge actually replays) | **Empty.** No data anywhere yet — waiting on the team's real data; see that folder's README for the exact layout expected. |
| `frontend/` ↔ backend wiring | **Started, not finished.** `frontend/app/dashboard/_components/LiveModelPanel.tsx` is genuinely wired to `/replay` + `/inference` and shows real model output; the rest of the dashboard is still hardcoded/mocked. Wiring the remaining panels is the concrete next gap. |
| Real ML model wiring (Step 8) | **Done.** All three models (`lstm_rul`, `xgboost_classifier`, `autoencoder`) have real artifacts loaded by `model_loader.py` and wired into `/inference`'s `HealthScoreOut`. |

## Local dev — one mode now, no Docker

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
alembic upgrade head      # creates ./dev.db (gitignored) -- zero setup
uvicorn app.main:app --reload
```

`DATABASE_URL` defaults to `sqlite:///./dev.db` (see
`backend/app/core/config.py`) — works with no external service at all.
To develop against the real database instead, create `backend/.env` by
hand (`.env*` is gitignored/permission-blocked from being written
directly by an agent) with Supabase's pooler connection string:

```
DATABASE_URL=postgresql://<supabase-pooler-connection-string>
ARTIFACTS_DIR=../ml/artifacts
DATA_DIR=../data
```

Same code path either way — nothing in `backend/app/db/` is
dialect-specific.

## Still open

- **The diagram needs a full redraw** — current one shows a topology
  (Docker network, Timescale, Grafana) that no longer exists at all.
- **Frontend hosting — resolved.** Vercel, live at
  https://drone-acharaya.vercel.app. Its origin is now in
  `backend/app/core/config.py`'s `cors_origins`. Vercel also issues
  per-branch preview URLs (`drone-acharaya-git-<branch>-<scope>.vercel.app`)
  which are **not** in that list — add them if a preview ever needs to call
  the API.
- **Supabase — resolved.** Project exists, migrations applied, backend
  connected. Two gotchas cost real time and are worth remembering: use the
  **Session pooler** string (direct connection is IPv6-only and unreachable
  from Render), and watch for a **trailing newline** when pasting the
  connection string into Render's env-var field — Postgres reads it as part
  of the database name and fails with a baffling
  `database "postgres\n" does not exist`.
- **Render free-tier cold start** — the service sleeps after ~15 min idle,
  and the next request pays 30-60s (measured: timed out at 30s, succeeded at
  ~60s). Mitigated by an external cron-job.org ping to `/health` every 10
  minutes. Deliberately *not* a GitHub Actions scheduled workflow: at
  1-minute minimum billing per run, every-10-minutes would burn ~4,320
  Actions minutes/month against a 2,000-minute private-repo quota, starving
  the real CI workflows.
- **`ml/artifacts/` on Render — resolved.** The runtime-required files for
  each pinned model version (~16MB total, see `ml/artifacts/README.md`) are
  committed to git directly via a per-file `.gitignore` allow-list; Render's
  normal GitHub-checkout build picks them up with no extra step. If a future
  model version is too large for this (a much bigger checkpoint, say),
  revisit — object storage fetched at build/start would be the fallback,
  not decided in detail since it hasn't been needed yet.
- **`frontend/` ↔ backend wiring** — mostly still the near-term gap.
  `LiveModelPanel.tsx` is wired for the live-model-output slice; the rest of
  the dashboard component tree
  (`frontend/app/dashboard/_components/LiveDashboard.tsx`) still defines,
  de facto, field shapes the backend doesn't yet serve for every panel —
  that hasn't been written down as a formal contract yet.
