# LSTM — multi-head engine health / RUL / sensor-fault model

Trained in `lstm_training.ipynb` (Kaggle/Colab GPU), not yet ported to
`train.py`. Weights and preprocessing artifacts are stored in Drive, not in
this repo — see [Artifacts](#artifacts) below. This README documents the
notebook's current, ruff-clean state and its most recent training run; treat
it as the source of truth over the older `train.py`/single-task-RUL skeleton
this folder used to describe.

## What it predicts, and when

One model, three heads, sharing a single LSTM encoder over a 60-timestep
(60-second, at this dataset's 1Hz export rate) input window. **Every head's
target is 60 seconds *after* the input window's last timestep** — this is a
forecasting model, not a nowcasting one. Given the last 60s of engine
behaviour, it answers "what will the engine's condition be a minute from
now," not "what is it right now." `forecast_horizon=60` in `build_windows()`
controls this; changing it changes what question the model answers.

| Head | Predicts | Loss | Output activation |
| --- | --- | --- | --- |
| A — health | 16 health-parameter scalars (`contract/health-parameter-registry.md` names), all oriented 1.0=healthy → 0.0=failed | MSE | Sigmoid (bounds to [0,1]) |
| B — RUL | Scalar remaining-useful-life, seconds, normalized by `RUL_SCALE_SECONDS=3600` during training | MSE (on normalized target) | Softplus (bounds to ≥0) |
| C — sensor fault | Per-channel fault class (`NONE`/`BIAS`/`DRIFT`/`NOISE`/`STUCK`/`DROPOUT`), one classifier per `sensor_fault_active_*` column in the data (currently 2: `cht_c3`, `vibration_rms_x_bearing_proxy`) | Cross-entropy, per channel, class-weighted by inverse train-split frequency | none (raw logits, argmax at inference) |

## Architecture

```
Input (batch, 60, 49)
  49 features = 34 scaled sensors + 3 missing-flags + 12 one-hot engine_state
        │
        ▼
  3-layer LSTM (hidden_size=256, unidirectional, dropout=0.5 between layers)
        │  (batch, 60, 256) — one hidden state per timestep
        ▼
  Attention pooling over timesteps
    attn_fc: Linear(256 → 1)
    softmax over the 60 timesteps → weights
    context = Σ (weight_t × hidden_t)         →  (batch, 256)
        │
        ▼
  shared_fc: Linear(256 → 128) → ReLU → Dropout(0.5)   →  (batch, 128)
        │
        ├──────────────┬───────────────────────┬─────────────────────────┐
        ▼              ▼                       ▼
   health_head     rul_head                sensor_fault_head
   Linear(128→64)  Linear(128→32)           Linear(128→128)
   ReLU            ReLU                     ReLU
   Linear(64→16)   Linear(32→1)             Linear(128→ channels×6)
   Sigmoid         Softplus                 reshape → (batch, channels, 6)
        │              │                       │
   16 health      1 RUL scalar          per-channel class logits
   values [0,1]   seconds/3600, ≥0      (argmax → NONE/BIAS/DRIFT/NOISE/STUCK/DROPOUT)
```

Model is **unidirectional/causal by design** — a bidirectional LSTM would let
the attention pooling see timesteps *after* the point being forecast from,
which isn't available at real inference time (there is no "future" telemetry
yet). Don't flip `bidirectional=True` without re-deriving what "future" means
for this model's actual serving context.

Attention pooling (rather than just taking the last hidden state) lets the
model weight which of the 60 input seconds matter most for a given
head/window, instead of forcing all temporal information through a single
final LSTM state.

Capacity was increased from an earlier `128/2-layer/dropout=0.3` baseline to
the `256/3-layer/dropout=0.5` configuration above — more capacity, with
correspondingly heavier dropout to control overfitting.

### Multi-task loss

```python
total = alpha * health_loss + beta * rul_loss + gamma * sensor_fault_loss
# alpha=1.0, beta=1.0, gamma=0.1 (this run; joint_loss's own default is 0.4)
```

`gamma` is deliberately lower than `alpha`/`beta`. Health and RUL are
regression losses (MSE) that behave smoothly across epochs; the sensor-fault
head's cross-entropy — even after class-weighting — is inherently noisier
epoch-to-epoch because the rare fault classes (down to single-digit counts
per validation batch for the rarest channel) make its loss sensitive to a
handful of hard examples. A lower `gamma` keeps that noise from dominating
the training signal and, more importantly, from dominating **checkpoint
selection**. This run used `gamma=0.1` (passed explicitly at call time, via
`NEW_GAMMA_LOSS_WEIGHT`), lower than the function's own `gamma=0.4` default —
tightened further after observing the sensor-fault term still swinging
val loss noticeably at 0.4.

**Checkpoint selection is `health_loss + rul_loss` only**, not total loss —
letting total loss pick the checkpoint meant occasionally saving a worse
health/RUL epoch just because sensor-fault got a lucky batch composition that
epoch. Decoupling fixed that.

**Optimizer / schedule**: Adam, `lr=5e-4`, `weight_decay=1e-4`, with
`ReduceLROnPlateau(mode='min', factor=0.5, patience=5)` stepped on
`checkpoint_score` (health+RUL), and early stopping at `patience=10` epochs
of no improvement on the same metric.

## Training data

`data/raw/{telemetry,groundtruth}_{train,validation}.csv` — the
`main_batch_1000` MVEM export, consolidated per-run into 4 CSVs (see
`ml/notebooks/DroneAcharaya_Preprocessing.ipynb` and this notebook's own load
cells for the consolidation logic). Split is **by `run_id`**, assigned by the
export itself (not a random re-split): 1146 train runs / 325 validation runs.

Key preprocessing steps (all in `lstm_training.ipynb`, ahead of
`build_windows()`):
- Health columns sign-flipped to a single 1.0=healthy→0.0=failed convention.
- RUL computed per-run as `max(0, nearest_failure_threshold_crossing_t − t)`,
  falling back to time-to-end-of-run if no threshold is ever crossed in that
  run.
- `vibration_rms_x` / `vibration_order_1x` / `vibration_rms_x_bearing_proxy`
  are NaN during specific engine states (crank-resolved vibration sidecar
  doesn't compute a value in `IDLE`/`CRUISE`/`SHUTDOWN`/`STARTING`/
  `THROTTLE_TRANSIENT`/`LOITER`/`CLIMB`/`DESCENT`) — handled with a
  `{col}_missing` flag column plus fill-with-0 (0 = training mean, post-scaling).
- `StandardScaler` fit on training-split rows only (and now saved to
  `scaler.joblib` — see [Artifacts](#artifacts)); `OneHotEncoder` for
  `engine_state` (12 categories) fit on training-split rows only.
- Windowing: `seq_len=60`, `stride=10` (not 1 — avoids a ~20GB `X_train` at
  stride 1), `forecast_horizon=60`.

### Target distributions (EDA)

![RUL distribution](assets/rul_distribution.png)

RUL is heavily zero-inflated — the histogram's first bin (normalized RUL ≈0)
is roughly 4× the height of the next-tallest bin, consistent with the
`max(0, ...)` clamp right-censoring everything after the first threshold
crossing. Mean normalized RUL is 0.21 (std 0.34) against a max of 1.91 (i.e.
~6900s), confirming the distribution is dominated by low/zero values with a
long tail. (The exact zero-row fraction isn't printed by this cell — worth
adding `(y_rul_train == 0).mean()` if you want the precise number.) Any
aggregate RUL error metric is dominated by this majority unless computed on
the non-zero-RUL subset specifically.

![Health parameter distributions](assets/eda_health_hist.png)

All 16 health parameters are similarly right-skewed — the large majority of
rows sit at 1.0 (fully healthy), with a much smaller mass spread across
lower values as degradation progresses. This is expected given most of a
mission is flown before a fault reaches failure-threshold severity.

![Sensor-fault class distributions](assets/eda_sensor_fault_dist.png)

`cht_c3` has all 5 classes present in training: NONE 89.78%, DRIFT 4.08%,
BIAS 2.21%, NOISE 2.20%, STUCK 1.73% (213,578 / 5,257 / 9,695 / 5,238 / 4,113
windows respectively, out of 237,881 total). `vibration_rms_x_bearing_proxy`
is far more extreme — NONE 99.98%, DROPOUT just 43 windows (0.02%). This
imbalance is the root cause of that channel's poor performance below; 43
positive examples in training is not enough to learn a class from, at any
`gamma` or class-weighting setting.

## Results (this run: early-stopped at epoch 25, best checkpoint epoch 15)

![Total loss curve](assets/total_loss.png)
![Health loss curve](assets/health_loss.png)
![RUL loss curve](assets/rul_loss.png)
![Sensor-fault loss curve](assets/sensor_fault_loss.png)

Training ran for 25 of a possible 60 epochs before early stopping triggered
(`patience=10` on `health+rul` checkpoint score, best at epoch 15,
`checkpoint_score=0.0411`). Note this run's `total_loss`/`sensor_fault_loss`
plots read noticeably lower in absolute value than earlier runs — this is
largely `gamma=0.1` shrinking that term's contribution to total loss, not
necessarily better classification (compare the confusion matrix below against
the loss curve, they don't move together 1:1).

**Health head** — converges smoothly, train/val track closely with no
divergence, ending around `val_health≈0.004`.

**RUL head** — `val_rul` oscillates in the `0.035-0.06` band (normalized
units) without a clear further downward trend after ~epoch 10 — this is
consistent with the RUL zero-inflation noted above: most windows are trivial
(predict ≈0), and the harder non-zero-RUL windows dominate the residual
variance from epoch to epoch depending on which ones land in a given batch.

**Sensor-fault head** — full validation-set confusion matrix (not just
spot-checks):

| Channel | Macro F1 | Any-fault detection precision / recall |
| --- | --- | --- |
| `sensor_fault_active_cht_c3` (BIAS/DRIFT/NOISE/STUCK) | 0.84 | 0.692 / 0.913 |
| `sensor_fault_active_vibration_rms_x_bearing_proxy` (DROPOUT) | 0.50 (collapsed) | 0.000 / nan (no positive predictions) |

`cht_c3` per-class recall: NONE 0.94, BIAS 0.71, DRIFT 0.81, NOISE 0.88,
STUCK 0.98 — recall is strong across every class, but precision dropped
versus an earlier, higher-`gamma` run (DRIFT precision fell to 0.40, with
3535 NONE windows misclassified as DRIFT). This is the expected tradeoff of
class-weighting harder (via lower `gamma` letting the weighted CE dominate
more of that head's own gradient): the model now over-predicts the rare
classes more readily, trading precision for recall. Whether that tradeoff is
the right one depends on the advisory layer's cost function for false
alarms vs. missed faults — not yet decided.

`vibration_rms_x_bearing_proxy` (DROPOUT) **still did not learn** — 0/9
recall on validation. See [Known limitations](#known-limitations).

### Single-sample checks

These are illustrative, not a substitute for the aggregate metrics above —
individual windows vary widely in difficulty.

**Sample index 64640** (true RUL 1654.0s): predicted **2044.89s (+390.89s
error, ~24% over)**. Health predictions track true values closely (within
±0.01-0.05) except `turbo_efficiency_deg` (pred 0.3957 vs true 0.3000,
+0.0957) — this sample is right at/past that parameter's failure threshold
(0.3), a harder region for the health head. Both sensor-fault channels
correctly predicted `NONE`.

**Demo cell, index 53209** (true RUL 318.0s): predicted **388.2s (+70.2s
error, ~22% over)**. Health predictions all ≈0.997-0.9995 (correctly reading
"healthy," consistent with this window predating the run's failure).
`cht_c3` predicted `DRIFT` — the true label for this specific window wasn't
printed by this cell, so treat this demo as illustrating the *mechanism* of
a forward pass rather than a validated sensor-fault accuracy claim.

## Known limitations

- **`sensor_fault_active_vibration_rms_x_bearing_proxy` (DROPOUT) is not
  usable.** Only 43 DROPOUT training windows exist out of 237,881 (0.02%,
  confirmed by the EDA value counts above) — 0/9 recall on the validation set
  confirms the model never learned this class regardless of architecture/loss
  tuning. Do not expose DROPOUT detection on this channel to the advisory
  layer, dashboard, or Unreal until the data generator produces substantially
  more DROPOUT-class runs. This is a concrete, quantified ask for whoever
  owns `simulation/fault_injection/`.
- **`cht_c3` precision/recall tradeoff is not yet tuned to a target
  operating point.** Lowering `gamma` improved recall but visibly hurt
  precision (more NONE-as-DRIFT false positives) versus a higher-`gamma`
  run. Whichever operating point the advisory layer actually wants
  (fewer false alarms vs. fewer missed faults) should drive `gamma` and/or a
  decision threshold on the softmax output, rather than argmax by default.
- **RUL accuracy on the non-zero-RUL subset is not yet aggregated as a single
  number.** The reported `val_rul` MSE is dominated by the large mass of
  windows at RUL=0 (see the zero-inflated distribution above); single-sample
  checks are illustrative, not a validated accuracy statistic. Computing
  RMSE/MAE restricted to the non-zero-RUL validation windows (not yet done)
  would give the actually decision-relevant error bar for "how far off is
  the model's forecasted countdown."
- **`forecast_horizon=60` is a single fixed operating point.** The model has
  not been evaluated at other horizons (e.g. 10s, 30s) on this batch/config —
  earlier informal comparisons (different data batch, before the fixes in
  this doc) suggested shorter horizons are easier to predict but give less
  lead time; this tradeoff hasn't been systematically swept here.
- **Not yet ported to `ml/features/feature_engineering.py` or `train.py`.**
  Per `ml/CLAUDE.md`'s notebooks rule, this settled logic (windowing, RUL
  labeling, scaling, class weighting) should eventually move into the shared
  feature builder so `train.py` — and therefore any reproducible CLI-driven
  retrain — doesn't require re-running the notebook by hand.
- **Digital-twin residuals (`ml/features/fit_digital_twin.py`'s
  `physics_residuals()`) are not fed to this model.** It trains on raw scaled
  sensor values, not operating-condition-adjusted residuals — see the
  Step 7 work in the root `CLAUDE.md`/`build_plan.md`. Wiring residuals in as
  additional features is the highest-leverage remaining improvement
  identified so far, not yet attempted.

## Artifacts

Stored in Google Drive (`/content/drive/MyDrive/DroneAcharaya/ml_artifacts/lstm_rul/`
when mounted in Colab; adjust for Kaggle's `/kaggle/working/` if trained
there), **not committed to this repo** (matches `ml/artifacts/` being
gitignored elsewhere in the project, even though this notebook's outputs
happen to live in Drive rather than `ml/artifacts/` directly):

| File | Contents |
| --- | --- |
| `lstm_best.pt` | Torch `state_dict`, checkpointed on best `val_health + val_rul` |
| `scaler.joblib` | Fitted `StandardScaler` for `SENSOR_COLUMNS` (train-split only) |
| `engine_state_encoder.joblib` | Fitted `OneHotEncoder` for `engine_state` (12 categories) |
| `rul_scale_seconds.json` | `{"rul_scale_seconds": 3600.0}` — required to convert the model's normalized RUL output back to seconds at inference time |

All four files are required to reproduce inference outside the notebook —
see the model architecture section above for the exact `EngineMultiHeadLSTM`
constructor args (`hidden_size=256, num_layers=3, dropout=0.5`) needed to
re-instantiate the class before loading `lstm_best.pt`'s `state_dict`.
