# data/raw/

See [`../README.md`](../README.md) for the full column reference (every
telemetry/groundtruth field explained) and the structured batch layout now
used for actual fleet batches — those live under
[`../processed/<batch_name>/`](../processed/README.md), split into
`train/`/`validation/` with `meta/` kept separate. This folder is scratch
space for one-off / ad-hoc simulation runs (single-mission tests, debugging),
not the structured dataset.

Immutable telemetry exactly as exported by `simulation/scripts/`. Never edited
in place — if a run is wrong, regenerate it under a new `run_id`.

- Format: one CSV or Parquet file per run, named `<run_id>.parquet`, plus a
  `<run_id>.meta.json` sidecar (mission profile, fault scenario, sample rate,
  seed, model version).
- Columns follow `../../contract/telemetry-schema.yaml` (telemetry) and
  `../../contract/ground-truth-schema.yaml` (the `_groundtruth.parquet`
  sidecar) — `../schema.md` is the older pre-contract draft, superseded now
  that `simulation/scripts/export_mission_to_schema.m` actually exists.
- **Gitignored** (`data/raw/**`) — only this README and `.gitkeep` are tracked.
