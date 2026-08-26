# Autoencoder — unsupervised anomaly detection

Learns to reconstruct **nominal** engine behaviour. At inference, reconstruction
error becomes an anomaly score; a sustained rise flags "something is wrong"
before the supervised classifier can name the fault.

## Expected input

- Source: `data/processed/` windowed feature tables built by
  `ml/features/feature_engineering.py`.
- **Nominal runs only** (`fault_type == "none"`), so the model never learns to
  reconstruct degraded behaviour.
- Shape: `(n_windows, window_size, n_features)`, standardised per feature using
  scaler statistics fitted on the training split only.
- Features: the continuous sensor channels plus their rolling statistics and FFT
  band energies. No labels used.

## Output artifact

Written to `ml/artifacts/autoencoder/<version>/`:

| File | Contents |
| --- | --- |
| `model.pt` | Torch `state_dict` for the encoder/decoder |
| `scaler.json` | Per-feature mean/std used at train time |
| `threshold.json` | Anomaly threshold + the percentile rule that set it |
| `metadata.json` | Feature order, window size, latent dim, git-less run stamp, metrics |

## Metrics reported

Reconstruction MSE on held-out nominal data; anomaly-detection ROC-AUC and
detection latency measured against faulted runs (used for threshold selection
only, never for weight updates).
