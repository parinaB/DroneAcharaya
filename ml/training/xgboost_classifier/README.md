# XGBoost classifier — fault type identification

Names the fault once anomaly detection has flagged one. Multi-class over the
fault taxonomy, chosen for strong tabular performance and because SHAP values on
a tree model give the advisory module a defensible "why".

## Expected input

- Source: `data/processed/` windowed feature tables (same feature builder as the
  autoencoder, so channels stay consistent).
- Rows: one per window. Columns: engineered features (rolling stats, FFT band
  energies, physics residuals) — **flat tabular, no time axis**.
- Label: `fault_type` (`none`, `injector_clog`, `bearing_wear`,
  `oil_starvation`, `cylinder_head_overheat`, `sensor_drift`,
  `ignition_misfire`), taken from the window's end sample.
- Splitting is **grouped by `run_id`** — no run appears in two splits.
- Class imbalance handled with sample weights, not resampling.

## Output artifact

Written to `ml/artifacts/xgboost_classifier/<version>/`:

| File | Contents |
| --- | --- |
| `model.json` | Native XGBoost booster dump |
| `feature_names.json` | Ordered feature list the booster expects |
| `label_encoding.json` | Class index → `fault_type` string |
| `shap_summary.json` | Mean absolute SHAP per feature per class (if `--shap`) |
| `metadata.json` | Hyperparameters, metrics, best iteration |

## Metrics reported

Per-class precision/recall/F1, macro-F1, confusion matrix, and mean detection
latency from `fault_onset` to first correct sustained prediction.
