# DroneAcharaya backend

FastAPI service for DroneAcharaya, the digital twin for a MALE UAV piston
engine (SIH 2026). Owns the Step 9 bridge (replays or, later, live-feeds
engine telemetry), persistence, and the API both `frontend/` and a future
Unreal client consume — see the [repo root README](../README.md) for the
full project and [`CLAUDE.md`](CLAUDE.md) here for the actual architecture
and conventions.

## Stack

- **FastAPI** + **uvicorn**, Python 3.11
- **SQLAlchemy** + **Alembic** — plain Postgres (Supabase in production,
  local SQLite by default), no TimescaleDB
- **pandas** — reads replayed run CSVs
- `pytest` for tests, matching the CI config at the repo root (`ci-tests.yml`)

## Getting started

```bash
python -m venv .venv && source .venv/bin/activate   # .venv\Scripts\activate on Windows
pip install -r requirements.txt
alembic upgrade head        # creates ./dev.db locally -- zero setup, no Docker
uvicorn app.main:app --reload   # http://localhost:8000/health
```

```bash
pytest              # unit tests + replay-fixture tests (skip if data/sample_runs/ is empty)
ruff check .         # lint, matches ci-lint.yml
mypy .               # typecheck, matches ci-lint.yml
```

No Docker, no local services to stand up beyond the venv — see
[`../ops/infra/README.md`](../ops/infra/README.md) for the deployment
target (Render + Supabase) and why Docker/TimescaleDB/Grafana were all
dropped.

## Structure

| Path | What it is |
| --- | --- |
| [`app/bridge/`](app/bridge/) | Step 9 bridge — `FrameSource`/`ReplaySource`, `BridgeService`, broadcast, CAN-framing stub. |
| [`app/db/`](app/db/) | SQLAlchemy models + the write path (doubles as the recorder). |
| [`migrations/`](migrations/) | Alembic migrations. |
| [`app/modules/replay/`](app/modules/replay/) | Session lifecycle wrapping the bridge. |
| [`app/modules/inference/`](app/modules/inference/) | Health/fault/RUL — a ground-truth stand-in today, a real model later, same response shape. |
| [`app/modules/advisory/`](app/modules/advisory/) | Placeholder — no rule set exists yet. |
| [`app/modules/ingestion/`](app/modules/ingestion/) | Bridge/session activity status. |
| [`app/core/`](app/core/) | Settings, logging, model loading (`model_loader.py`, not implemented yet). |
| [`tests/`](tests/) | Includes `test_fixture_data.py`, which activates automatically once real data lands in `../data/sample_runs/`. |

## Current data

`../data/sample_runs/` is empty — the bridge and its tests are built and
verified against that layout, but there's nothing to replay locally until
real run data is dropped in (see that folder's README for the exact shape
expected). Until then, `/replay/runs` returns an empty list and starting a
session against any `run_id` returns 404 — that's the correct, honest
behavior, not a bug.

## Learn more

- Repo root [`README.md`](../README.md) for the full project, and
  [`docs/build_plan.md`](../docs/build_plan.md) for where this sits in the
  overall build order (Step 9).
- [`CLAUDE.md`](CLAUDE.md) here for the actual architecture, the API
  surface, and the conventions for extending it.
