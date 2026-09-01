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
| [`contract/`](contract/) | The frozen-in-progress contract every other folder builds against — [telemetry schema](contract/telemetry-schema.yaml), [environment schema](contract/environment-schema.yaml), [parameter source table](contract/parameter-source-table.csv), [failure-mode matrix](contract/failure-mode-matrix.csv), and the [health-parameter registry](contract/health-parameter-registry.md) that keeps the last two in sync. Drafts — see [`contract/README.md`](contract/README.md). |
| [`backend/`](backend/) | FastAPI service — real [bridge](backend/app/bridge/)/DB-backed [replay](backend/app/modules/replay/), ground-truth-stand-in [inference](backend/app/modules/inference/), placeholder [advisory](backend/app/modules/advisory/). Python 3.11, SQLAlchemy + Alembic, deploys to Render + Supabase (no Docker). |
| [`frontend/`](frontend/) | Next.js 15 dashboard (App Router, TypeScript, Tailwind) — merged, real UI ([live dashboard](frontend/app/dashboard/)), currently hardcoded/mocked data, not yet wired to the backend. |
| [`simulation/`](simulation/) | MATLAB/Simulink engine model, run scripts, [calibration](simulation/calibration/) references, and [fault injection](simulation/fault_injection/) definitions. Structure and docs only so far. |
| [`ml/`](ml/) | [Training](ml/training/) for the three models, shared [feature engineering](ml/features/), [evaluation](ml/evaluation/) protocol, and versioned [artifacts](ml/artifacts/). |
| [`data/`](data/) | Telemetry [schema](data/schema.md) (the source of truth for column names), immutable [raw](data/raw/) runs, model-ready [processed](data/processed/) datasets, and committed [sample runs](data/sample_runs/). |
| [`docs/`](docs/) | [PS mapping](docs/ps_mapping.md), [architecture](docs/architecture.md), [methodology](docs/methodology.md), [deployment roadmap](docs/deployment_roadmap.md), and [pitch](docs/pitch/) material. |

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
and validated — see `docs/build_plan.md`'s Step 6 log and
`data/processed/main_batch_1000/` (123 units, 1111 missions,
`verify_batch.m`-clean) for the real training dataset. Step 7's digital twin
has a first working slice (`ml/features/fit_digital_twin.py` +
`physics_residuals()` — data-driven expected-value models, verified to
discriminate a real fault; see `docs/build_plan.md`'s Step 7 log). **Step 8
(ML training) is underway**: autoencoder and LSTM training are actively in
progress via `ml/notebooks/` and their per-model training notebooks; the
XGBoost classifier hasn't started yet. **`backend/` now has a real Step 9
vertical slice**: a bridge (`app/bridge/`) that replays a run and writes
telemetry + a ground-truth-stand-in health score through SQLAlchemy/Alembic
(plain Postgres — no TimescaleDB) into real `/replay`, `/inference`,
`/advisory` endpoints — see `ops/infra/README.md` for the deployment target
(Render + Supabase, no Docker, no Grafana) and why those calls were made.
It's idle right now, though: `data/sample_runs/` is empty, waiting on the
team's real data. **`frontend/` is merged and real** (`app/dashboard/`), but
still 100% hardcoded/mocked — not yet wired to the backend's new endpoints;
that wiring is the next concrete gap. `docs/architecture.md`,
`docs/methodology.md` and `docs/deployment_roadmap.md` are heading
skeletons. `data/README.md`, `ml/evaluation/README.md`, and the
`simulation/` READMEs carry the real decisions and are the place to start
reading.