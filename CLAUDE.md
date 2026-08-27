# DroneAcharaya — shared context

Predictive health monitoring and digital twin for MALE UAV piston engines —
SIH 2026. Full project description and folder layout: [`README.md`](README.md).

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
  matrix using the same health-scalar names, are drafted in
  [`contract/`](contract/) — see [`contract/README.md`](contract/README.md)
  for what's still open before they lock. Treat `contract/` as the current
  source of truth for field/parameter/fault names; extend it there first,
  never invent a name downstream.

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

Step 0 (the `contract/` files) is drafted — see above. Everything after it
(`simulation/`, `backend/`, `ml/`, `frontend/`) still predates this plan and
is simpler than it: `data/schema.md` is an older flat schema with seven fault
classes vs. `contract/`'s draft with 15, no environment service / bridge /
crank-resolved sidecar exist yet. See
[Status vs. this plan](docs/build_plan.md#status-vs-this-plan) in the build
plan for the full gap list. Don't assume the scaffold already implements the
plan — check the gap list first.

## Where things live

| Doc | Covers |
| --- | --- |
| [`README.md`](README.md) | Project pitch, repo structure, getting started, CI. |
| [`docs/build_plan.md`](docs/build_plan.md) | The full build plan (this file's source of truth). |
| [`contract/`](contract/) | Step 0's constitution files — telemetry schema, environment schema, parameter source table, failure-mode matrix, health-parameter registry. Drafts; see `contract/README.md`. |
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
