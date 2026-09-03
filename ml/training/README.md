# ml/training/

One folder per model, each with a `train.py` (argparse CLI) and a README stating
its input schema and output artifact layout.

| Model | Job | Status |
| --- | --- | --- |
| [`autoencoder/`](autoencoder/README.md) | Unsupervised anomaly score from nominal-only training | trained (v3) and wired into `backend/` |
| [`xgboost_classifier/`](xgboost_classifier/README.md) | Per-channel sensor-fault classification (not multi-class fault type — see that README) | trained (v1) and wired into `backend/` |
| [`lstm_rul/`](lstm_rul/README.md) | Multi-head health/RUL/sensor-fault regression | trained (v1) and wired into `backend/` (health+RUL heads only — see that README for why its own sensor-fault head is excluded) |

All three read from `data/processed/` and write versioned artifacts into
`ml/artifacts/` (gitignored by default; runtime files for the pinned versions
are committed — see `ml/artifacts/README.md`). All three take `--data-path` and `--output-path`;
the two neural models also take `--epochs`.

## What the preprocessing notebook outputs

`ml/notebooks/DroneAcharaya_Preprocessing.ipynb` is the shared prototype for
`autoencoder/` and `lstm_rul/` preprocessing — see [`ml/CLAUDE.md`](../CLAUDE.md)
for the rule that its settled logic must land in
`ml/features/feature_engineering.py`, not stay notebook-only.

| Output | Shape | Built in |
| --- | --- | --- |
| `merged_df` | full wide dataframe, all rows | after merge + all encoding/scaling steps |
| `X_train`, `X_val` | `(n_samples, 60, 49)` | `build_windows()` — 60-timestep windows, 49 features (38 scaled sensors + 11 one-hot `engine_state`) |
| `y_health_train`/`val` | `(n_samples, 16)` | 16 health-parameter values, all 1.0=healthy→0.0=failed |
| `y_rul_train`/`val` | `(n_samples,)` | derived RUL scalar |
| `y_sensor_fault_train`/`val` | `(n_samples, N_channels)` | per-channel class id, 0–5 |
| `train_mask` | boolean, row-level on `merged_df` | marks which rows belong to train vs val runs |

Two consumers draw from this notebook, but at different granularities —
that's the part worth being explicit about.

### Autoencoder — consumes `merged_df` directly (per-timestep rows, not the windowed arrays)

| | |
| --- | --- |
| Input | `merged_df.loc[ae_train_mask, SENSOR_COLUMNS + engine_state_col_names]` — single timesteps, healthy rows only (`train_mask` AND health ≥ threshold), shape `(n_healthy_rows, 49)` |
| What it predicts | Its own input, reconstructed — `x̂ ≈ x`. It has no external label; the "prediction" is a reconstruction of the same 49-feature vector it was given |
| What you actually use afterward | Not the reconstruction itself, but the reconstruction error (`‖x̂ − x‖²`), computed for every row in `merged_df` (healthy and faulty alike) → gives you `ae_recon_error` (continuous) and `ae_anomaly_flag` (thresholded binary) |

So the AE never sees `X_train`, `y_health_train`, etc. at all — it works
directly off `merged_df` at the single-timestep level, using only a
healthy-filtered subset for training and the full dataset for scoring.

### Multi-head LSTM — consumes the windowed arrays from `build_windows()`

| | |
| --- | --- |
| Input | `X_train` / `X_val` — `(n_samples, 60, 49)`, all runs (healthy + faulty), full sequences |
| What it predicts | Three separate outputs from three heads: |
| → Head A (regression) | `y_health` — 16 health-parameter values at the window's last timestep |
| → Head B (regression) | `y_rul` — scalar RUL at the window's last timestep |
| → Head C (classification) | `y_sensor_fault` — per-channel class id (NONE/BIAS/DRIFT/NOISE/STUCK/DROPOUT) at the window's last timestep |
