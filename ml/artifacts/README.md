# ml/artifacts/

Versioned trained-model outputs: weights, scalers, thresholds, label encodings,
metadata and evaluation dumps.

**Gitignored by default, with a per-file allow-list for what the backend
actually loads at runtime.** The root `.gitignore`'s `ml/artifacts/` section
ignores everything here, then explicitly un-ignores the exact files
`backend/app/core/model_loader.py` reads for the versions
`backend/app/core/config.py`'s `*_version` settings are pinned to — small
enough (~16MB across all four model families combined) to commit directly,
no Git LFS, so a plain `git clone` + `pip install -r requirements.txt` +
`uvicorn app.main:app` is enough to run the backend with real model output,
including on Render. As of this writing that's:

| Family | Version | Committed files |
| --- | --- | --- |
| `lstm_rul` | v1 | `lstm_best.pt`, `scaler.joblib`, `engine_state_encoder.joblib`, `rul_scale_seconds.json`, `metadata.json` |
| `xgboost_classifier` | v1 | `xgboost_cht_c3.json`, `xgboost_bearing_vibration.json`, `metadata.json` |
| `autoencoder` | v3 | `model.pt`, `scaler.json`, `threshold.json`, `metadata.json` |
| `digital_twin` | v3 | all 27 per-channel `.joblib` files, `metadata.json` |

Everything else — evaluation-only exports (e.g. `autoencoder/v3/`'s
747MB `validation_predictions.csv`), scratch/experiment checkpoints, and any
version not currently pinned in `config.py` — stays gitignored and should be
distributed out of band (shared drive / release attachment), never
committed. When a new version replaces a pinned one, update both
`config.py`'s default and the `.gitignore` allow-list together, or the old
version silently keeps shipping.

## Layout

```
ml/artifacts/
├── digital_twin/<version>/     one HistGradientBoostingRegressor per target
│                                channel + metadata.json -- see fit_digital_twin.py
├── autoencoder/<version>/
├── xgboost_classifier/<version>/
└── lstm_rul/<version>/
```

Each version directory carries the model file, its scaler, a `metadata.json`
(feature order, hyperparameters, metrics, dataset identifier) and an `eval/`
subfolder. `<version>` is `vN` assigned in order. `digital_twin/` is the one
exception to "one file per version" -- it's one `.joblib` file per target
channel (see its `metadata.json`'s `target_channels` for the list) since each
channel gets its own independently-fit expected-value model, not a single
multi-output model.

The backend loads from here via `backend/app/core/model_loader.py`, resolving
paths against `Settings.artifacts_dir`.

**Sharing a new version:** for a version `config.py` should actually load at
runtime, commit its runtime files directly (add them to the `.gitignore`
allow-list above, following the same per-file pattern as the existing
versions). For anything else — an experimental version, an eval-only
export — copy the version directory out of band (shared drive / release
attachment) instead. Either way, `metadata.json` is what makes an artifact
reproducible, so never ship weights without it.
