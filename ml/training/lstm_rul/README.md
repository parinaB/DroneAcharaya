# LSTM — remaining useful life (RUL) regression

Predicts how much operating time remains before the degradation crosses the
failure threshold. Sequential model because RUL depends on the *trajectory* of
degradation, not the instantaneous state.

## Expected input

- Source: `data/processed/` sequence tensors built from faulted runs (and
  nominal runs held at the RUL cap).
- Shape: `(n_sequences, sequence_length, n_features)`, standardised with scaler
  statistics from the training split only.
- Target: `time_to_failure` in seconds at the sequence's last timestep, clipped
  at `--rul-cap` — RUL is not meaningfully predictable long before onset, and an
  uncapped target teaches the model to extrapolate noise.
- Sequences are drawn with a stride and never cross a `run_id` boundary.
- Split grouped by `run_id`, same grouping as the classifier.

## Output artifact

Written to `ml/artifacts/lstm_rul/<version>/`:

| File | Contents |
| --- | --- |
| `model.pt` | Torch `state_dict` |
| `scaler.json` | Per-feature mean/std |
| `metadata.json` | Feature order, sequence length, RUL cap, metrics |

## Metrics reported

RMSE and MAE in seconds, plus an asymmetric scoring penalty that weights
**late** predictions (optimistic RUL) more heavily than early ones — overshooting
remaining life is the operationally dangerous error.
