# DroneAcharaya

**Predictive health monitoring and digital twin for MALE UAV piston engines —
SIH 2026.**

DroneAcharaya addresses the SIH 2026 problem statement on building a **Digital
Twin for MALE (Medium Altitude Long Endurance) UAV** propulsion health
management. A MALE UAV flies long unattended missions where an engine fault that
goes unnoticed is not a maintenance ticket but a lost airframe, and where there
is no pilot on board to hear the engine change note. The system pairs a
physics-based Simulink model of the piston engine — the twin, which generates
labelled telemetry across mission profiles and injected fault ramps that would
be impossible to collect from real airframes — with a three-model ML health
layer: an autoencoder that flags anomalies from nominal-only training, an
XGBoost classifier that names the fault, and an LSTM that estimates remaining
useful life. A FastAPI backend serves ingestion, inference, advisory and replay;
a Next.js dashboard turns those outputs into gauges, trends, alert cards and a
scrubable run replay, so an operator sees not just *that* something is wrong but
what it is, how long they have, and what to do about it.

## Structure

| Folder | Purpose |
| --- | --- |
| [`contract/`](contract/README.md) | The frozen-in-progress contract every other folder builds against — [telemetry schema](contract/telemetry-schema.yaml), [environment schema](contract/environment-schema.yaml), [parameter source table](contract/parameter-source-table.csv), [failure-mode matrix](contract/failure-mode-matrix.csv), and the [health-parameter registry](contract/health-parameter-registry.md) that keeps the last two in sync. Drafts — see [`contract/README.md`](contract/README.md). |
| [`backend/`](backend/README.md) | FastAPI service — real [bridge](backend/app/bridge/)/DB-backed [replay](backend/app/modules/replay/), [inference](backend/app/modules/inference/) (real `lstm_rul` + `xgboost_classifier` + `autoencoder` model output, ground-truth stand-in before each model's window fills), placeholder [advisory](backend/app/modules/advisory/). Python 3.11, SQLAlchemy + Alembic, deploys to Render + Supabase (no Docker). See [`backend/README.md`](backend/README.md) and [`backend/CLAUDE.md`](backend/CLAUDE.md) for the architecture. |
| [`frontend/`](frontend/README.md) | Next.js 15 dashboard (App Router, TypeScript, Tailwind) — merged, real UI ([live dashboard](frontend/app/dashboard/), shared [components](frontend/components/README.md)), currently hardcoded/mocked data except the [live model panel](frontend/app/dashboard/_components/LiveModelPanel.tsx), which is wired to the backend's real replay/inference endpoints. |
| [`simulation/`](simulation/README.md) | MATLAB/Simulink engine model ([`model/`](simulation/model/README.md)) and run/export scripts ([`scripts/`](simulation/scripts/README.md)) — built and validated. `calibration/` and `fault_injection/` are superseded stubs (see [`simulation/CLAUDE.md`](simulation/CLAUDE.md) for where that logic actually lives now). |
| [`ml/`](ml/CLAUDE.md) | [Training](ml/training/README.md) for the three models ([autoencoder](ml/training/autoencoder/README.md), [xgboost_classifier](ml/training/xgboost_classifier/README.md), [lstm_rul](ml/training/lstm_rul/README.md)), shared [feature engineering](ml/features/README.md), [evaluation](ml/evaluation/README.md) protocol, and versioned [artifacts](ml/artifacts/README.md) (gitignored by default, except the ~16MB of runtime files for the versions actually pinned in `backend/app/core/config.py`, which are committed). |
| [`data/`](data/README.md) | Telemetry [schema](data/schema.md) (the source of truth for column names — see [`data/README.md`](data/README.md) for the full data-folder reference), immutable [raw](data/raw/README.md) runs, model-ready [processed](data/processed/README.md) datasets, and [sample runs](data/sample_runs/README.md) (tracked fixture slot, currently empty). |
| [`docs/`](docs/build_plan.md) | The full [build plan](docs/build_plan.md) (five layers, Step 0–12 order — read this before proposing architecture), [PS mapping](docs/ps_mapping.md), [architecture](docs/architecture.md), [methodology](docs/methodology.md), [deployment roadmap](docs/deployment_roadmap.md), and [pitch](docs/pitch/README.md) material. |
| [`ops/infra/`](ops/infra/README.md) | Deployment target and reasoning — Render + Supabase, no Docker/TimescaleDB/Grafana. |

## Getting started

**Backend** (Python 3.11):

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload          # http://localhost:8000/health
pytest                                  # smoke test
```

**Frontend** (Node 20+):

```bash
cd frontend
npm install
cp .env.local.example .env.local        # points at http://localhost:8000
npm run dev                             # http://localhost:3000
```

## CI

Six GitHub Actions workflows in [`.github/workflows/`](.github/workflows/), each
running on **push** and **pull_request** against `main` and `develop`. They are
ports of the CodeBuild buildspecs in the `capbot` and `capmobai-frontend`
repositories, which run the same tool set on AWS CodeBuild with PR-only
webhooks.

| Workflow | Checks |
| --- | --- |
| [`ci-lint.yml`](.github/workflows/ci-lint.yml) | `ruff check`, `ruff format --check`, `mypy` / ESLint, `tsc --noEmit` |
| [`ci-tests.yml`](.github/workflows/ci-tests.yml) | `pytest` with coverage report |
| [`ci-build.yml`](.github/workflows/ci-build.yml) | `next build` |
| [`ci-deps.yml`](.github/workflows/ci-deps.yml) | `pip-audit` / `npm audit --audit-level=critical` |
| [`ci-secrets.yml`](.github/workflows/ci-secrets.yml) | Gitleaks secret scan over full history |
| [`ci-semgrep.yml`](.github/workflows/ci-semgrep.yml) | Semgrep SAST (`p/python`, `p/javascript`, `p/typescript`, `p/owasp-top-ten`) |

Tool config lives at the repo root: [`ruff.toml`](ruff.toml),
[`mypy.ini`](mypy.ini), [`pytest.ini`](pytest.ini).
[`.github/dependabot.yml`](.github/dependabot.yml) opens weekly update PRs for
npm, pip and the actions themselves.

Run the same checks locally:

```bash
pip install ruff mypy pytest-cov
ruff check . && ruff format --check . && mypy . && pytest
cd frontend && npm run lint && npm run typecheck && npm run build
```


## Status

`simulation/` (the physics layer: environment service, engine core,
crank-resolved sidecar, and the full dataset-generation pipeline) is built
and validated — see [`docs/build_plan.md`](docs/build_plan.md)'s Step 6 log
and `data/processed/main_batch_1000/` (123 units, 1111 missions,
`verify_batch.m`-clean) for the real training dataset. Step 7's digital twin
has a first working slice (`ml/features/fit_digital_twin.py` +
`physics_residuals()` — data-driven expected-value models, verified to
discriminate a real fault; see `docs/build_plan.md`'s Step 7 log).

**Step 8 (ML training) — all three models are trained and wired into the
backend**: `autoencoder` (v3, paired with `ml/artifacts/digital_twin/v3/`'s
27 per-channel regressors — see
[`ml/training/autoencoder/README.md`](ml/training/autoencoder/README.md)),
`xgboost_classifier` (v1, two per-channel sensor-fault classifiers — see
[`ml/training/xgboost_classifier/README.md`](ml/training/xgboost_classifier/README.md)),
and `lstm_rul` (v1, multi-head health/RUL — see
[`ml/training/lstm_rul/README.md`](ml/training/lstm_rul/README.md)) all have
real artifacts loaded by
[`backend/app/core/model_loader.py`](backend/app/core/model_loader.py).

**`backend/` has a real Step 9 vertical slice, now serving real model
output, not just ground truth**: a bridge (`app/bridge/`) replays a run and
writes telemetry + a health score through SQLAlchemy/Alembic (plain
Postgres — no TimescaleDB) into real `/replay`, `/inference`, `/advisory`
endpoints. `/inference`'s `HealthScoreOut` returns `lstm_rul`'s
health/fault/RUL once a session's 60-frame rolling window fills,
`xgboost_classifier`'s per-channel sensor-fault classification once a
shorter 10-frame window fills, and the `autoencoder`'s row-level anomaly
score on every scoreable frame (gated to `null` on
`STARTING`/`SHUTDOWN`/`THROTTLE_TRANSIENT` transients) — a
ground-truth stand-in covers any session before those windows fill. See
[`ops/infra/README.md`](ops/infra/README.md) for the deployment target
(Render + Supabase, no Docker, no Grafana) and why those calls were made.
The real, tracked `data/sample_runs/` is still empty, though — waiting on
the team's real data (see
[`data/sample_runs/README.md`](data/sample_runs/README.md)) — so this slice
is currently exercised only against synthetic/local fixtures, not committed
ones.

**`frontend/` is merged and mostly still hardcoded/mocked**
(`app/dashboard/`), except its
[`LiveModelPanel`](frontend/app/dashboard/_components/LiveModelPanel.tsx),
which is genuinely wired to the backend's `/replay` + `/inference`
endpoints and displays real `lstm_rul`/`xgboost_classifier`/`autoencoder`
output once a session starts. Wiring the rest of the dashboard's mocked
panels to the backend is the next concrete gap.

`docs/architecture.md`, `docs/methodology.md` and
`docs/deployment_roadmap.md` are heading skeletons.
[`data/README.md`](data/README.md), [`ml/evaluation/README.md`](ml/evaluation/README.md),
and the `simulation/` READMEs ([`simulation/README.md`](simulation/README.md),
[`simulation/model/README.md`](simulation/model/README.md),
[`simulation/scripts/README.md`](simulation/scripts/README.md)) carry the
real decisions and are the place to start reading.