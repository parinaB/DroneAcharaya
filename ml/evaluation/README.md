# ml/evaluation/

How every model in `ml/training/` gets judged before it is allowed near a demo.

## Held-out validation approach

**Split by run, not by row.** Consecutive telemetry samples are near-duplicates,
so a random row-level split leaks the same run into train and test and produces
inflated scores. Splits are therefore **grouped by `run_id`**: a run appears in
exactly one of train / validation / test. Target ratio 70 / 15 / 15 by run count.

**Stratify the grouping.** Runs are grouped-stratified over
`(fault_type, severity_band, mission_profile_id)` so every split covers every
fault class across the severity range and across mission profiles.

**Hold out unseen conditions deliberately.** Beyond the random grouped split, a
separate *generalisation* set holds entire configurations never seen in
training — at minimum one whole mission profile and one severity band. This is
the honest measure of whether the models learned engine physics or memorised
scenarios; both numbers get reported.

**Nominal-only training for the autoencoder.** Faulted runs touch the
autoencoder only at threshold-selection time, on the validation split. The test
split stays untouched until the final run.

**The test split is opened once.** All tuning uses validation. If test informs a
change, it becomes validation data and a fresh test set is cut.

## Metrics

| Model | Primary | Secondary |
| --- | --- | --- |
| Autoencoder | ROC-AUC (nominal vs faulted) | Reconstruction MSE, false-alarm rate per flight hour |
| XGBoost classifier | Macro-F1 | Per-class P/R, confusion matrix |
| LSTM RUL | RMSE (s) | MAE, asymmetric late-prediction penalty |

**Detection latency** is reported across the pipeline: seconds from
`fault_onset` to a sustained correct detection, per fault class and severity.
For prognostics that number matters more than accuracy — a correct call that
arrives after failure is worth nothing.

**Baselines.** Every model is reported against a trivial baseline (fixed
threshold on raw channels; majority class; mean RUL). A model that cannot beat
its baseline does not ship.

## Contents

Evaluation scripts, metric definitions, and per-run comparison reports. Figures
and metric dumps land under `ml/artifacts/<model>/<version>/eval/`.
