# Autoencoder — unsupervised anomaly detection

Learns to reconstruct **nominal** engine behaviour. At inference, reconstruction
error becomes an anomaly score; a sustained rise flags "something is wrong"
before the supervised classifier can name the fault.

## Expected input (v1, as actually implemented)

- Source: `data/processed/<batch_name>/{train,validation}/telemetry|groundtruth/`,
  read directly by `train.py` — not a separate windowed-feature-table build step.
- Features: `ml/features/feature_engineering.py`'s `physics_residuals()` output
  (measured − digital-twin-expected, per channel; run
  `ml/features/fit_digital_twin.py` first) + operating condition (`rpm`,
  `engine_load`, `throttle`, `altitude`, `ambient_temperature`, `air_density`)
  + one-hot `engine_state`, per `docs/build_plan.md`'s Step 8 feature-vector
  design. **Row-level (flat), not windowed**, and no rolling-stat/FFT "trend
  features" — `rolling_stats()`/`extract_fft_bands()` are still unimplemented
  stubs, so a `(n_windows, window_size, n_features)` windowed encoder is a
  natural v2 once those land, not what v1 trains on.
- Standardised per feature (residuals + condition columns only; the
  engine_state one-hot is left as 0/1) using scaler statistics fitted on the
  training rows only.
- **Nominal runs only.** To avoid the digital twin's own regressors leaking
  into what should be an honest residual, training never touches rows the
  twin was fit on — it reuses `fit_digital_twin.py`'s exact healthy-run
  selection, then reproduces that script's own train/holdout run split (same
  seed, ratio recovered from `digital_twin`'s `metadata.json`) and trains only
  on the holdout half.
- Threshold selection and evaluation (ROC-AUC, false-alarm rate, detection
  rate) run on the **validation** split, using per-row ground-truth health
  columns for genuine healthy-vs-faulted labels — never on training data, per
  `ml/evaluation/README.md`.

## Output artifact

Written to `ml/artifacts/autoencoder/<version>/`:

| File | Contents |
| --- | --- |
| `model.pt` | Torch `state_dict` for the encoder/decoder |
| `scaler.json` | Per-feature mean/std used at train time |
| `threshold.json` | Anomaly threshold + the percentile rule that set it |
| `metadata.json` | Feature/residual/condition columns, hyperparameters, dataset id, metrics, run stamp |

## Metrics reported

Reconstruction MSE on held-out nominal validation rows; anomaly-detection
ROC-AUC, false-alarm rate and detection rate at the chosen threshold, all
measured against the validation split's genuinely faulted rows (used for
threshold selection and reporting only, never for weight updates).
**Detection latency** (time from `fault_onset` to sustained correct
detection) is not computed yet — a v2 addition once this is being evaluated
per fault class rather than as one pooled row-level metric.
