# data/processed/

Model-ready datasets derived from `../raw/` by
`ml/features/feature_engineering.py`: windowed, feature-engineered and split.

- Format: Parquet feature tables for the classifier; `.npy`/`.pt` tensors for the
  sequence models. Each dataset carries a `manifest.json` recording the source
  `run_id`s, feature list, window parameters and the split assignment.
- Splits are grouped by `run_id` — see `ml/evaluation/README.md`.
- Fully reproducible from `../raw/` plus the manifest, so it is safe to delete.
- **Gitignored** (`data/processed/**`) — only this README and `.gitkeep` are tracked.
