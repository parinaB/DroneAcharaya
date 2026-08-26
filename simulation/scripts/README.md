# simulation/scripts/

MATLAB drivers that run the model in `../model/` and export telemetry to
`data/raw/`.

**Purpose.** Batch-drive the plant model across mission profiles and fault
scenarios, then serialise runs into the flat schema the backend ingests.

**Expected file types**
- `*.m` — scripts and functions. Anticipated set:
  - `run_mission.m` — execute one mission profile, return a timetable.
  - `batch_generate.m` — sweep profiles x fault scenarios x severities.
  - `export_run.m` — write a run to CSV/Parquet using `data/schema.md` columns.
  - `plot_run.m` — quick-look diagnostics for a single run.
- `*.mlx` — live scripts, for exploratory work only.

**Conventions**
- Every exported run carries a unique `run_id` and a `mission_profile_id`.
- Randomised scenarios take an explicit seed argument so runs are reproducible.
