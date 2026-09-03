# Deploying the backend — Render + Supabase runbook

**Status: done.** Backend is live at https://droneacharaya.onrender.com,
frontend at https://drone-acharaya.vercel.app, Supabase Postgres connected
with all migrations applied. This document is now both the record of how it
was done and the runbook for redoing it (a fresh environment, a second
deployment, or a teammate reproducing it).

No real credentials are written anywhere in this repo; `render.yaml`
deliberately leaves `DATABASE_URL` unset (`sync: false`) so Render prompts
for it interactively instead.

## Three gotchas that cost real time — read these first

1. **Root Directory must be `backend`.** Left at the repo-root default, the
   build fails immediately with
   `Could not open requirements file: 'requirements.txt'`.
2. **Use Supabase's Session pooler string, not "Direct connection".** The
   direct host (`db.<ref>.supabase.co`) resolves to IPv6-only; Render has no
   IPv6 egress, so it fails with
   `connection to server at ... failed: Network is unreachable`. The pooler
   host (`aws-0-<region>.pooler.supabase.com`, user `postgres.<ref>`) is
   IPv4 and works.
3. **Watch for a trailing newline** when pasting the connection string into
   Render's env-var field — copy buttons often include one, and Postgres
   reads it as part of the database name, failing with
   `FATAL: database "postgres\n" does not exist`. Paste via a plain text
   editor and check the cursor ends immediately after the final `s`.

## Prerequisites

- **`data/sample_runs/` needs real mission files** before `/replay/runs`
  returns anything — it's currently empty, so the deployed API works but has
  nothing to replay. Deploying before that is fine (everything else is
  testable via `/health` and `/docs`), just know what you'll see.

## Steps

### 1. Supabase — create the database

1. Create a new Supabase project (free tier).
2. **Settings → Database → Connection pooling** — copy the **Session mode**
   pooler connection string (looks like
   `postgresql://postgres.<ref>:<password>@<pooler-host>:5432/postgres` or
   similar — Supabase's exact hostname format has changed over time, use
   whatever the dashboard actually shows). **Use the pooler string, not the
   direct connection** — the free tier's direct-connection limit is low,
   and a single Render web service dyno already benefits from pooling.
3. Keep this string somewhere private — it goes into Render's dashboard in
   step 3, never into a committed file.

### 2. Push `render.yaml` to the repo (already written, this session)

Render auto-detects a `render.yaml` at the repo root when you connect the
GitHub repo, and provisions the service it describes. If you'd rather click
through Render's UI manually instead of using the blueprint, the equivalent
manual settings are:

| Setting | Value |
| --- | --- |
| Runtime | Python 3 |
| Root directory | `backend` |
| Build command | `pip install -r requirements.txt && alembic upgrade head` |
| Start command | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| Health check path | `/health` |

### 3. Render — create the web service, set the real env var

1. New → Blueprint (if using `render.yaml`) or New → Web Service (manual),
   pointing at the GitHub repo.
2. When prompted for `DATABASE_URL` (blueprint) or in **Environment**
   (manual), paste Supabase's pooler string from step 1.
3. Confirm `ARTIFACTS_DIR=../ml/artifacts` and `DATA_DIR=../data` are set
   (from `render.yaml`, or add manually) — these resolve relative to
   `rootDir: backend`, matching `backend/app/core/config.py`'s local-dev
   defaults exactly.
4. Deploy. The build command runs `alembic upgrade head` automatically —
   this is what actually creates the tables in Supabase the first time;
   no manual migration step needed.

### 4. Confirm the migration actually landed in Supabase

In Supabase's **Table Editor** or SQL editor, confirm `runs`, `telemetry`,
`residuals`, `health_scores`, `advisory_state`, and `alembic_version` all
exist. This is the first real test against actual Postgres — everything
so far has only been verified against local SQLite.

### 5. CORS — once frontend hosting is decided

Edit `backend/app/core/config.py`'s `cors_origins` default to include the
real deployed frontend URL (e.g. `https://<project>.vercel.app`), not just
`localhost:3000`. Redeploy (Render auto-redeploys on a push to the
connected branch).

### 6. Smoke test the live deployment

```bash
curl https://<your-service>.onrender.com/health
# then, once data/sample_runs/ has real files:
curl -X POST https://<your-service>.onrender.com/api/v1/replay/<run_id>/start \
  -H "Content-Type: application/json" -d '{"speed": 10}'
curl https://<your-service>.onrender.com/api/v1/replay/<session_id>/latest
curl "https://<your-service>.onrender.com/api/v1/inference/latest?session_id=<session_id>"
```

## Frontend (Vercel)

1. vercel.com → **Add New → Project** → import the repo.
2. **Set Root Directory to `frontend`** (same gotcha as Render).
3. Framework preset auto-detects as Next.js; leave build settings default.
4. Environment variable: `NEXT_PUBLIC_API_BASE_URL` =
   `https://droneacharaya.onrender.com`.
5. Deploy. Then add the resulting origin to
   `backend/app/core/config.py`'s `cors_origins` and redeploy the backend,
   or the browser blocks every frontend→backend call.

## Cold starts

Render's free tier sleeps a service after ~15 minutes idle; the next request
pays 30-60s (measured: timed out at 30s, succeeded at ~60s). Handled by an
external **cron-job.org** job pinging `/health` every 10 minutes.

Deliberately not a GitHub Actions scheduled workflow: runs bill at a
1-minute minimum, so every-10-minutes is ~4,320 Actions minutes/month
against a 2,000-minute private-repo quota — it would starve the real CI
workflows. cron-job.org does the same job for free and schedules more
punctually than GitHub's cron, which frequently slips 5-15 minutes under
load (enough to miss Render's 15-minute idle window).

Note the first ping after a sleep will show as **failed/timeout** in
cron-job.org's dashboard (its request timeout is shorter than the cold
start) while still successfully waking the service. Only consistent
failures indicate a real problem.

## Known gaps this runbook doesn't solve

- **`data/sample_runs/` is empty** — the API is live but has nothing to
  replay, so `/replay/runs` returns `[]`. Committing real mission files is
  the remaining blocker for an end-to-end demo.
- **No CI step runs this deploy automatically** — it's triggered by Render
  watching the connected GitHub branch, separate from this repo's existing
  GitHub Actions workflows.
- **Secrets rotation** — the Supabase database password should be rotated
  after any session where it was pasted around (Project Settings → Database
  → Reset database password, then update `DATABASE_URL` in Render).
