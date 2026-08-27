# ml/ — Autoencoder, XGBoost, LSTM

Intelligence layer. See root [`CLAUDE.md`](../CLAUDE.md) for the full build
plan and cross-subsystem data flow; this file only covers what's specific to
working in `ml/`.

## What lives here

| Folder | Holds |
| --- | --- |
| [`training/autoencoder/`](training/autoencoder/) | Anomaly detection — nominal-only training. |
| [`training/xgboost_classifier/`](training/xgboost_classifier/) | Multi-class fault identification + SHAP explainability. |
| [`training/lstm_rul/`](training/lstm_rul/) | Remaining-useful-life regression. |
| [`features/`](features/) | `feature_engineering.py` — the **single** feature builder all three models share. |
| [`evaluation/`](evaluation/) | Held-out validation protocol, metrics, comparison reports. |
| [`artifacts/`](artifacts/) | Versioned trained-model outputs — **gitignored**, distribute out of band. |

## Non-negotiables

- **One feature builder, not three.** All three models must call into
  `ml/features/feature_engineering.py` (spectral / temporal / physics-residual
  families) — training and live inference cannot drift apart. If a model
  needs a new feature, add it there, not as a local one-off.
- **Split by `run_id`, never by row.** Consecutive telemetry samples are
  near-duplicates; a random row-level split leaks data. Splits are grouped
  by `run_id` and stratified over `(fault_type, severity_band,
  mission_profile_id)` — 70/15/15 by run count. See
  [`evaluation/README.md`](evaluation/README.md) for the full protocol,
  including the held-out generalisation set.
- **The test split opens once.** All tuning uses validation. If test
  informs a change, it becomes validation data and a fresh test set is cut.
- **Autoencoder sees faulted runs only at threshold-selection time**, and
  only on the validation split — never during training.
- **Every model beats its baseline or it doesn't ship** (fixed threshold /
  majority class / mean RUL, per `evaluation/README.md`).
- **Column names in are the schema's, not a local rename.** Read from
  `../data/processed/` using the exact field names in
  `../data/schema.md`/`../contract/telemetry-schema.yaml` and the health-
  parameter names in `../contract/health-parameter-registry.md`. Model
  predictions write to their own suffixed columns (`fault_type_pred`,
  `rul_pred`) — never overwrite ground truth.
- **Artifacts are versioned and never committed.** Each `ml/artifacts/<model>/<version>/`
  needs a `metadata.json` (feature order, hyperparameters, metrics, dataset
  id) alongside the weights — an artifact without it isn't reproducible and
  shouldn't be shared.

## Commands

```bash
python -m ml.training.autoencoder.train --data-path data/processed --output-path ml/artifacts
python -m ml.training.xgboost_classifier.train --data-path data/processed --output-path ml/artifacts
python -m ml.training.lstm_rul.train --data-path data/processed --output-path ml/artifacts --epochs 50

ruff check ml/ && ruff format --check ml/ && mypy ml/ && pytest ml/
```

## Approval gate

No `git commit`/`push`/merge without explicit user confirmation this
session — same rule as the root [`CLAUDE.md`](../CLAUDE.md). This applies
even to artifact metadata or config changes that feel routine.
