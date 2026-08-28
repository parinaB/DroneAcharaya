# contract/

Layer 1 of [`../docs/build_plan.md`](../docs/build_plan.md) — Step 0's four
constitution files, plus the health-parameter registry that ties two of them
together, plus `ground-truth-schema.yaml`, the simulation-only companion to
the telemetry schema (added once Step 6's dataset-generation design made clear
that "measured" telemetry and validation ground truth can't share a schema —
see that file's own header for why). Everything downstream (`simulation/`,
`backend/`, `ml/`, `frontend/`, eventually Unreal) is built to speak these
files. They are **drafts** (`schema_version: 0.1-draft`, multiple `TBD`/`[TBD-*]`
values) — not yet the frozen contract the build plan calls for, but this is
the shape it's frozen into.

| File | Carries |
| --- | --- |
| [`telemetry-schema.yaml`](telemetry-schema.yaml) | Every field the engine/twin/AI/dashboard exchange: name, data_type, unit, sample_rate, source, valid_range, missing_value_policy, quality_flag. |
| [`environment-schema.yaml`](environment-schema.yaml) | The canonical atmosphere service contract — scenario inputs in, `ambient_pressure` / `ambient_temperature` / `air_density` out. One implementation, three consumers (engine, twin, Unreal). |
| [`parameter-source-table.csv`](parameter-source-table.csv) | Every physical parameter the engine model needs: value, unit, source, source_type (published/literature/calibrated/assumed), confidence, sensitivity, notes. `sensitivity=high` + `source_type=assumed` rows are the ones to source first. |
| [`failure-mode-matrix.csv`](failure-mode-matrix.csv) | All fault rows (currently 15 — see the cross-reference note in the registry) as failure → cause → operating condition → first weak signal → correlated signals → injection mechanism → detection signature → discriminator → prediction → consequence → action → model tier → health parameter → condition-dependent. |
| [`health-parameter-registry.md`](health-parameter-registry.md) | The canonical name for every health scalar referenced by the parameter table and the failure matrix. Rename here first, or not at all. |
| [`ground-truth-schema.yaml`](ground-truth-schema.yaml) | Simulation-only companion to `telemetry-schema.yaml` — true pre-sensor-fault signal values, time-varying health-parameter trajectories (theta), and per-channel sensor-fault activity. Deliberately kept OUT of the telemetry schema (which must also describe real ECU data, and real hardware has no ground truth). Stored as a separate file per run, validation/scoring only — never a model input. |

## Before these lock

Each file carries its own open-decisions list (`telemetry-schema.yaml`'s
`OPEN DECISIONS` block, `environment-schema.yaml`'s `open_decisions`, the
`TBD` rows in `parameter-source-table.csv`). Locking means:

1. All `[TBD-VALID]` ranges resolved against the AE300-class envelope (needs
   the parameter table's `published` rows sourced first).
2. All `[TBD-ENG]` fields confirmed once the corresponding Simulink subsystem
   exists (Step 2 of the build plan).
3. `[TBD-AI]` vibration feature set confirmed by whoever builds Layer 4.
4. The `{ like: ... }` shorthand rows in `telemetry-schema.yaml` expanded to
   full explicit entries.
5. Every `assumed` + `sensitivity: high` row in the parameter table either
   sourced or explicitly signed off as a stated modelling assumption.

Until then, treat these as the working draft everyone builds against — not as
frozen. A breaking change to a field name, unit, or health-parameter name
must be made here first and propagated, never invented downstream.
