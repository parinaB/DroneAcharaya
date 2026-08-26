# ml/artifacts/

Versioned trained-model outputs: weights, scalers, thresholds, label encodings,
metadata and evaluation dumps.

**This folder is gitignored** (`ml/artifacts/**` in the root `.gitignore`) —
model weights are large binaries that do not belong in git history. Only this
README and `.gitkeep` are tracked.

## Layout

```
ml/artifacts/
├── autoencoder/<version>/
├── xgboost_classifier/<version>/
└── lstm_rul/<version>/
```

Each version directory carries the model file, its scaler, a `metadata.json`
(feature order, hyperparameters, metrics, dataset identifier) and an `eval/`
subfolder. `<version>` is `vN` assigned in order.

The backend loads from here via `backend/app/core/model_loader.py`, resolving
paths against `Settings.artifacts_dir`.

**Sharing artifacts:** copy the version directory out of band (shared drive /
release attachment) rather than committing it. `metadata.json` is what makes a
copied artifact reproducible, so never ship weights without it.
