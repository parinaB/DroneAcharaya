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

## Actual deployment target

| Piece | Where | Notes |
| --- | --- | --- |
| Backend (FastAPI + bridge) | Render, free web service, deployed from GitHub, **native Python runtime — no Dockerfile** | Render injects its own `$PORT`; start command is `uvicorn app.main:app --host 0.0.0.0 --port $PORT`. |
| Database | Supabase, free Postgres tier | Plain Postgres, no TimescaleDB extension — `backend/app/db/models.py` has no hypertable calls anywhere. Use Supabase's **connection pooler** string (not the direct connection) for `DATABASE_URL` — free tier has a low direct-connection limit. |
| Frontend | `frontend/` (Next.js), merged and real — hosting not yet confirmed | Vercel's free tier is the default fit for a Next.js app if not already decided elsewhere. |
| Unreal client | External, not built yet (Step 11) | Would hit the backend's REST/WS API on Render, same as any other consumer. |
| ML models | Not deployed as services | Artifact files under `ml/artifacts/`, loaded in-process by `backend/app/core/model_loader.py` (still `NotImplementedError` — no artifacts exist yet). Render's filesystem has no shared volume with a teammate's training machine — how artifacts actually get onto Render is unsolved, see "Still open." |

## What's built vs. what's still a placeholder

| Piece | Status |
| --- | --- |
| `backend/app/bridge/` — `FrameSource`/`ReplaySource`/`BridgeService`, `can_framing.py` stub | **Built.** Verified end-to-end with a hand-made 5-frame smoke run (not committed) — telemetry + health-score rows land correctly, health index tracks a decaying fault. |
| `backend/app/db/` — SQLAlchemy models + Alembic migrations | **Built**, migrated and tested against local SQLite. Untested against real Postgres/Supabase — no project exists yet (see below). |
| `/replay`, `/inference`, `/advisory`, `/ingestion` real endpoints | **Built**, replacing the four one-line stub routers. |
| `data/sample_runs/` (what the bridge actually replays) | **Empty.** No data anywhere yet — waiting on the team's real data; see that folder's README for the exact layout expected. |
| `frontend/` ↔ backend wiring | **Not started.** The merged dashboard is 100% hardcoded/mocked data; `frontend/lib/api-client.ts` still only calls `/health`. This is the concrete next gap, not a backend one. |
| Real ML model wiring (Phase 7) | **Not started**, waits on `ml/artifacts/` existing. |

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
- **Frontend hosting isn't confirmed** — assumed Vercel by default; confirm
  before wiring CORS (`backend/app/core/config.py`'s `cors_origins`) to a
  real deployed URL instead of just `localhost:3000`.
- **Supabase project doesn't exist yet** — `DATABASE_URL` is a plain env
  var so nothing is blocked on it; wire the real pooler string in whenever
  it's created, and actually test the schema against real Postgres then
  (only verified against SQLite so far).
- **`ml/artifacts/` on Render** — genuinely unsolved. Once real artifacts
  exist, something has to get them onto Render's filesystem (commit small
  ones, or fetch from object storage at build/start) — not decided yet.
- **`frontend/` ↔ backend wiring** — the real near-term gap. The dashboard
  component tree (`frontend/app/dashboard/_components/LiveDashboard.tsx`)
  defines, de facto, the exact field shapes the backend needs to serve;
  that hasn't been written down as a formal contract yet.
