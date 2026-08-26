# data/raw/

Immutable telemetry exactly as exported by `simulation/scripts/`. Never edited
in place — if a run is wrong, regenerate it under a new `run_id`.

- Format: one CSV or Parquet file per run, named `<run_id>.parquet`, plus a
  `<run_id>.meta.json` sidecar (mission profile, fault scenario, sample rate,
  seed, model version).
- Columns follow `../schema.md` exactly.
- **Gitignored** (`data/raw/**`) — only this README and `.gitkeep` are tracked.
