# DroneAcharaya — shared context

Predictive health monitoring and digital twin for MALE UAV piston engines —
SIH 2026. Full project description and folder layout: [`README.md`](README.md).

## What this system does

DroneAcharaya is a digital twin for the piston engine on a MALE (Medium
Altitude Long Endurance) UAV. A MATLAB/Simulink Mean Value Engine Model
(MVEM) simulates the engine's thermal, mechanical and fuel-system behaviour
across mission profiles, with injectable fault ramps standing in for real
degradation (bearing wear, injector clogging, oil starvation, sensor faults,
etc.) that can't be safely harvested from a real airframe. Exported telemetry
feeds an ML health layer — an autoencoder for nominal-vs-anomalous detection,
an XGBoost classifier (with SHAP) to name the fault, and an LSTM to estimate
remaining useful life — served through a FastAPI backend. A Next.js
dashboard and an Unreal Engine visualization consume those same model
outputs to show an operator not just *that* something is wrong, but what it
is, how long they have, and what to do about it. Six people build the MVEM,
the three ML models, and the visualization layer in parallel against a
frozen shared contract, so no one is blocked waiting on anyone else's
in-progress work.

## The build plan

The full plan — five layers, a Step 0–12 build order, and the dependency
graph that forces that order — lives in
[`docs/build_plan.md`](docs/build_plan.md). Read it before proposing
architecture, adding a new module, or changing the telemetry/environment
contract. Short version:

- **Layer 1** Contract & knowledge (schemas + parameter table + failure
  matrix) → **Layer 2** Physics (Simulink engine, fault injection, crank
  sidecar) → **Layer 3** Digital twin (residuals, health estimation) →
  **Layer 4** Intelligence (detection, diagnosis, RUL, advisory) →
  **Layer 5** Integration & presentation (bridge, CAN, Grafana, Unreal).
- Build order starts at **Step 0: freeze the four constitution files**
  (`telemetry-schema.yaml`, `environment-schema.yaml`,
  `parameter-source-table.csv`, `failure-mode-matrix.csv`), then the
  canonical environment service, then the engine, gated by validation
  (Step 3) before anything downstream is trusted. These four files, plus a
  `health-parameter-registry.md` that keeps the parameter table and failure
  matrix using the same health-scalar names, plus `ground-truth-schema.yaml`
  (the simulation-only companion carrying pre-sensor-fault true values and
  health-parameter trajectories — deliberately kept out of the telemetry
  schema, which must also describe real ECU data with no ground truth
  available), are drafted in [`contract/`](contract/) — see
  [`contract/README.md`](contract/README.md) for what's still open before
  they lock. Treat `contract/` as the current source of truth for
  field/parameter/fault names; extend it there first, never invent a name
  downstream.
- **Solver mode is dual-config, not one global setting**: batch dataset
  generation (Step 6) uses a variable-step solver and resamples onto a
  uniform grid at export; live/bridge-connected runs (Step 7 twin, Step 9
  bridge, Step 11 Unreal) need fixed-step so the twin's two parallel engine
  copies stay tick-aligned. Same `.slx`, different `SimulationInput`/configset
  per use case — see `build_plan.md`'s Step 2 note for the reasoning and the
  live step-size ballpark.
- **Simscape/Powertrain Blockset is scoped to exactly the crank-resolved
  sidecar (Step 5) — nowhere else.** The mean-value core (Step 2) is
  lumped-parameter Simulink signal-flow throughout, cooling included — do not
  reach for Simscape's acausal physical-network blocks anywhere in Step 2 just
  because a subsystem *could* be modeled that way in the abstract (a coolant
  loop, for instance). `failure-mode-matrix.csv`'s `model_tier` column is the
  arbiter: `crank_resolved` appears only on `misfire`, `combustion_instability`,
  and `mechanical_vibration`; everything else is `mean_value`.

### Two invariants — hold these regardless of what you're working on

1. **Contract-first, connect-last.** The schemas and constitution files are
   frozen early; the engine, twin, and AI are built headless against them;
   Unreal/Grafana substitute in at the end. Don't invent a field name or unit
   that isn't in the frozen schema — extend the schema instead, and update
   everything that reads it.
2. **Physics before consumers.** Nothing that consumes engine behavior — twin,
   AI, dashboard, Unreal — should be built or trusted ahead of the engine's
   validation gate (Step 3: outputs land inside published data across
   multiple operating points). If the engine isn't validated yet, treat
   downstream work as provisional and say so.

The **non-obvious shared dependency** to watch for: the canonical environment
service (ISA + hot-day offset → air density) must be the *same* code path for
the engine, the twin's expected model, and Unreal. If they diverge, a
residual stops meaning "fault" and starts meaning "modeling mismatch" — a
silent bug, not a loud one.

## Current status vs. the plan

Step 0 (the `contract/` files) is drafted — see above, now including the
ground-truth schema and the resolved solver-mode decision. **Steps 1-6 are
built and validated**: the canonical environment service, the mean-value
engine core (`engine_core.slx`), the crank-resolved sidecar
(`crank_resolved_sidecar.slx`), and the full Step 6 dataset-generation
pipeline all exist. `data/processed/main_batch_1000/` is the real training
dataset — 123 units / 1111 missions across all 11 fault classes,
`verify_batch.m`-clean (0 FAIL, 0 WARN) — ready to hand off for the
multi-headed LSTM (telemetry as input, groundtruth as labels: fault_class,
health trajectories, severity, RUL). **Step 7 (digital twin residuals) has
a first working slice**: `ml/features/fit_digital_twin.py` fits data-driven
expected-value models from healthy-baseline missions, and
`ml/features/feature_engineering.py`'s `physics_residuals()` applies them
with transient-state gating — verified to cleanly discriminate a real fault
(see `build_plan.md`'s Step 7 log). **Step 8 onward (autoencoder/XGBoost/
LSTM training, bridge, Grafana/Unreal) has not been started.**
`backend/`/`frontend/` still predate this plan and are simpler than it:
`data/schema.md` is an older flat schema with seven fault classes vs.
`contract/`'s draft with 15. See
[Status vs. this plan](docs/build_plan.md#status-vs-this-plan) in the build
plan for the full gap list. Don't assume the scaffold already implements the
plan — check the gap list first.

**Unreal Engine project does not exist yet.** No `unreal/` folder has been
created. When someone starts it, it is a pure visualization consumer — see
the boundary rule below — and this file should be updated with its location
and a nested `CLAUDE.md` added under it at that point.

## Architecture map — where things live, how data flows

| Layer | Folder | Role |
| --- | --- | --- |
| Contract | [`contract/`](contract/) | Frozen-in-progress schemas everything else builds against. |
| Physics (MVEM) | [`simulation/`](simulation/) | Simulink plant model (`model/`), MATLAB drivers (`scripts/`), fault ramp definitions (`fault_injection/`), calibration references (`calibration/`). Exports telemetry to `data/raw/`. |
| ML | [`ml/`](ml/) | Three models under `training/` (`autoencoder/`, `xgboost_classifier/`, `lstm_rul/`), shared `features/feature_engineering.py`, `evaluation/` protocol, versioned `artifacts/` (gitignored). Reads from `data/processed/`. |
| Serving | [`backend/`](backend/) | FastAPI service: telemetry ingestion, model inference, advisory, replay. Loads ML artifacts via `backend/app/core/model_loader.py`. |
| Presentation (2D) | [`frontend/`](frontend/) | Next.js 15 dashboard — live view, replay, reports. Calls the backend API; `frontend/lib/types.ts` mirrors the telemetry schema. |
| Presentation (3D) | *not yet created* | Unreal Engine visualization — see below. |

**Data flow, end to end:**

1. `simulation/scripts/` runs the MVEM (`simulation/model/`) across mission
   profiles, with `simulation/fault_injection/` ramps applied, and exports
   runs as CSV/Parquet into `data/raw/` using the exact column names in
   `data/schema.md` (soon `contract/telemetry-schema.yaml`).
2. `ml/features/feature_engineering.py` turns `data/processed/` runs into the
   feature sets all three models share; each model in `ml/training/` trains
   against those features and writes versioned artifacts to `ml/artifacts/`.
3. `backend/app/core/model_loader.py` loads the latest artifact per model;
   `backend/app/modules/inference/` runs live inference over ingested
   telemetry; `backend/app/modules/advisory/` and `.../replay/` build on
   those outputs. The backend is the only thing that talks to model
   artifacts directly.
4. `frontend/` and the future Unreal project both consume the **backend's
   API output** (or replay files it serves) — never raw ML artifacts, and
   never each other's state. They are two independent renderers of the same
   backend contract.

## Boundary: Unreal Engine is visualization only

Unreal must never contain simulation physics, fault-injection logic, ML
inference, or feature engineering. It consumes already-computed outputs —
telemetry values, health scores, fault classifications, RUL estimates —
through the same backend API/data contract as `frontend/`, and only renders
them (engine model animation, gauges, alert visuals, spatial UI). If a
calculation would change under different visualization settings, it belongs
upstream in `simulation/`, `ml/`, or `backend/`, not in Unreal. When the
Unreal project is created, its own `CLAUDE.md` should restate this boundary
and list exactly which backend endpoints/fields it consumes.

## Naming conventions across MATLAB ↔ Python ↔ Unreal

These are the conventions that drift silently if not held to one source of
truth. `contract/` is that source of truth; this is a summary, not a
replacement for reading it.

- **Telemetry field names** (`RPM`, `CHT`, `EGT`, `Oil_P`, `Oil_T`,
  `Fuel_flow`, `Vibration`, `Battery_V`, `Injection_timing`, `fault_type`,
  `fault_onset`, `severity`, `time_to_failure`, `env_conditions`, …): defined
  once in `data/schema.md` today, migrating to
  `contract/telemetry-schema.yaml`. MATLAB export scripts in
  `simulation/scripts/` must emit these names exactly. Never rename a field
  in one layer without updating the schema and every consumer
  (`frontend/lib/types.ts`, backend ingestion mapping, MATLAB export
  scripts).
- **Frontend aliases are the one sanctioned exception.** `frontend/lib/types.ts`
  uses friendlier names for six fields (e.g. `Oil_P` → `oil_pressure`,
  `time_to_failure` → `rul`) — see the mapping table in `data/schema.md`.
  The ingestion module owns that mapping; nothing downstream re-maps again.
- **Health-parameter scalars** (`injector_health_c1`, `bearing_health`,
  `misfire_rate`, …): canonical names live only in
  `contract/health-parameter-registry.md` — `snake_case`, `_health` suffix
  for condition scalars, `_deg` for degradation-driver scalars, `_c{1..4}`
  for per-cylinder. Rename here first, or not at all.
- **Fault-type strings** (`injector_clog`, `bearing_wear`, `oil_starvation`,
  `cylinder_head_overheat`, `sensor_drift`, `ignition_misfire`, plus the
  sensor-fault modes in the registry): must match across
  `simulation/fault_injection/`, `data/schema.md` / the failure-mode matrix,
  and `frontend/lib/types.ts`'s `FaultType` union.
- **Model prediction columns** never overwrite ground truth — predictions
  get their own suffix (`fault_type_pred`, `rul_pred`), ground truth columns
  stay untouched.
- **Units are carried in the schema table, never in the field name** — a
  column's unit is documented once (schema), not encoded ad hoc
  (`cht_celsius`) by whoever writes it next.

## Commands

**Simulation (MATLAB/Simulink)** — from `simulation/scripts/` in MATLAB:
```matlab
run_mission('<mission_profile_id>')     % single run, returns a timetable
batch_generate('<config>')              % sweep profiles x faults x severities
export_run(run, 'data/raw/')            % write CSV/Parquet in schema column order
```
(No `.slx`/`.m` files are committed yet — these are the anticipated entry
points per `simulation/*/README.md`; confirm actual filenames once they
land.)

**ML training/inference** (Python 3.11, from repo root or `ml/`):
```bash
python -m ml.training.autoencoder.train --data-path data/processed --output-path ml/artifacts
python -m ml.training.xgboost_classifier.train --data-path data/processed --output-path ml/artifacts
python -m ml.training.lstm_rul.train --data-path data/processed --output-path ml/artifacts --epochs 50
```

**Backend** (Python 3.11):
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload          # http://localhost:8000/health
pytest
```

**Frontend** (Node 20+):
```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev                             # http://localhost:3000
npm run lint && npm run typecheck && npm run build
```

**Unreal** — not yet applicable; document the build command here once the
project exists (packaged build target, engine version, how it points at a
running backend instance).

**Full local check**, same as CI (see README's CI table):
```bash
ruff check . && ruff format --check . && mypy . && pytest
cd frontend && npm run lint && npm run typecheck && npm run build
```

## Human-approval gate

**No `git commit`, `git push`, or merge (including squash/rebase-merge via
`gh`) without explicit user confirmation in the current session — every
time, even if a previous action of the same kind was approved.** Staging and
showing a diff is fine without asking; making it permanent is not. This
holds regardless of how routine the change looks, since six people push to
this repo in parallel and a wrong commit/push is not locally reversible for
everyone else.

## Where things live

| Doc | Covers |
| --- | --- |
| [`README.md`](README.md) | Project pitch, repo structure, getting started, CI. |
| [`docs/build_plan.md`](docs/build_plan.md) | The full build plan (this file's source of truth). |
| [`contract/`](contract/) | Step 0's constitution files — telemetry schema, environment schema, parameter source table, failure-mode matrix, health-parameter registry, ground-truth schema. Drafts; see `contract/README.md`. |
| [`docs/ps_mapping.md`](docs/ps_mapping.md) | SIH problem-statement → deliverable traceability (skeleton, TBD). |
| [`docs/architecture.md`](docs/architecture.md) | System architecture (skeleton, TBD — should be filled from the build plan). |
| [`docs/methodology.md`](docs/methodology.md) | Modelling methodology (skeleton, TBD — should be filled from the build plan). |
| [`data/schema.md`](data/schema.md) | Older (pre-`contract/`) flat telemetry schema — what `backend/`/`ml/`/`frontend/` currently actually implement, until `contract/telemetry-schema.yaml` locks and replaces it. |
| [`simulation/README.md`](simulation/README.md) | Simulink model tree layout (structure only, no `.slx` committed yet). |

## Working conventions

- Python 3.11 backend (`ruff`, `mypy`, `pytest`), Next.js 15 / TypeScript
  frontend (ESLint, `tsc`). Config at repo root: `ruff.toml`, `mypy.ini`,
  `pytest.ini`. See the README's CI table for what each GitHub Actions
  workflow checks.
- `data/schema.md` (or, once frozen, `telemetry-schema.yaml`) is the single
  source of truth for field names/units — don't rename or reshape telemetry
  fields ad hoc in one layer without updating the schema and the other
  consumers (`frontend/lib/types.ts`, ingestion mapping, MATLAB export
  scripts).
