# data/processed/

See [`../README.md`](../README.md) for the full column reference (every
telemetry/groundtruth field explained, the multi-headed-LSTM head mapping,
and known limitations). Each batch lives under `<batch_name>/` (e.g.
`sanity_batch_001/`) with this layout, written directly by
`simulation/scripts/run_fleet_missions.m`:

```
<batch_name>/
  train/telemetry/       <run_id>.csv            validation/telemetry/
  train/groundtruth/      <run_id>_groundtruth.csv  validation/groundtruth/
  meta/                  <run_id>.meta.json (both splits together)
  completed.log, errors.log
```

Model-ready datasets derived from `../raw/` by
`ml/features/feature_engineering.py`: windowed, feature-engineered and split.

- Format: Parquet feature tables for the classifier; `.npy`/`.pt` tensors for the
  sequence models. Each dataset carries a `manifest.json` recording the source
  `run_id`s, feature list, window parameters and the split assignment.
- Splits are grouped by `run_id` — see `ml/evaluation/README.md`.
- Fully reproducible from `../raw/` plus the manifest, so it is safe to delete.
- **Gitignored** (`data/processed/**`) — only this README and `.gitkeep` are tracked.
