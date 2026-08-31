# LSTM — multi-head engine health / RUL / sensor-fault model

Trained in `lstm_training.ipynb` (Kaggle/Colab GPU), not yet ported to
`train.py`. Weights and preprocessing artifacts are stored in Drive, not in
this repo — see [Artifacts](#artifacts) below. This README documents what was
actually built and trained; treat it as the source of truth over the older
`train.py`/single-task-RUL skeleton this folder used to describe.

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
  2-layer LSTM (hidden_size=128, unidirectional, dropout=0.3 between layers)
        │  (batch, 60, 128) — one hidden state per timestep
        ▼
  Attention pooling over timesteps
    attn_fc: Linear(128 → 1)
    softmax over the 60 timesteps → weights
    context = Σ (weight_t × hidden_t)         →  (batch, 128)
        │
        ▼
  shared_fc: Linear(128 → 64) → ReLU → Dropout(0.3)   →  (batch, 64)
        │
        ├──────────────┬───────────────────────┬─────────────────────────┐
        ▼              ▼                       ▼
   health_head     rul_head                sensor_fault_head
   Linear(64→64)   Linear(64→32)            Linear(64→128)
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

### Multi-task loss

```python
total = alpha * health_loss + beta * rul_loss + gamma * sensor_fault_loss
# alpha=1.0, beta=1.0, gamma=0.4
```

`gamma` is deliberately lower than `alpha`/`beta`. Health and RUL are
regression losses (MSE) that behave smoothly across epochs; the sensor-fault
head's cross-entropy — even after class-weighting — is inherently noisier
epoch-to-epoch because the rare fault classes (down to single-digit counts
per validation batch for the rarest channel) make its loss sensitive to a
handful of hard examples. A lower `gamma` keeps that noise from dominating
the training signal and, more importantly, from dominating **checkpoint
selection** — see below.

**Checkpoint selection is `health_loss + rul_loss` only**, not total loss.
Earlier training runs (see [Known limitations](#known-limitations)) showed
the sensor-fault term swinging by ±0.1 nats between adjacent epochs purely
from which hard examples landed in that epoch's shuffle; letting total loss
pick the checkpoint meant occasionally saving a worse health/RUL epoch just
because sensor-fault got lucky that epoch. Decoupling fixed that.

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
  run. **~65-79% of rows have RUL=0** (right-censored past first failure) —
  this zero-inflation is a real property of the label definition, not a bug.
- `vibration_rms_x` / `vibration_order_1x` / `vibration_rms_x_bearing_proxy`
  are NaN during specific engine states (crank-resolved vibration sidecar
  doesn't compute a value in `IDLE`/`CRUISE`/`SHUTDOWN`/`STARTING`/
  `THROTTLE_TRANSIENT`/`LOITER`/`CLIMB`/`DESCENT`) — handled with a
  `{col}_missing` flag column plus fill-with-0 (0 = training mean, post-scaling).
- `StandardScaler` fit on training-split rows only; `OneHotEncoder` for
  `engine_state` (12 categories) fit on training-split rows only.
- Windowing: `seq_len=60`, `stride=10` (not 1 — avoids a ~20GB `X_train` at
  stride 1), `forecast_horizon=60`.

## Results (60 epochs, this checkpoint)

![Total loss curve](assets/total_loss.png)
![Health loss curve](assets/health_loss.png)
![RUL loss curve](assets/rul_loss.png)
![Sensor-fault loss curve](assets/sensor_fault_loss.png)

**Health head** — converged and stable. Train/val both settle around
`0.001-0.003` MSE with no divergence; single-sample checks track ground
truth to within ~0.001-0.02 across all 16 params.

**RUL head** — `val_rul` ≈ `0.043-0.049` (normalized units). On a held-out
sample with a genuinely non-zero true RUL (1053s), the model predicted
1035.65s (**-17.35s error**) — as tight as ±0.3s on another checked sample
(318.3s predicted vs 318.0s true). These are point checks, not an aggregate
statistic over the non-zero-RUL subset — see
[Known limitations](#known-limitations) for what's not yet quantified.

**Sensor-fault head** — full validation-set confusion matrix (not just
spot-checks):

| Channel | Macro F1 | Any-fault detection precision / recall |
| --- | --- | --- |
| `sensor_fault_active_cht_c3` (BIAS/DRIFT/NOISE/STUCK) | 0.87 | 0.938 / 0.890 |
| `sensor_fault_active_vibration_rms_x_bearing_proxy` (DROPOUT) | 0.50 (collapsed) | 0.000 / 0.000 |

`cht_c3` is genuinely usable — per-class recall ranges 0.69 (BIAS) to 1.00
(STUCK), and confusion is concentrated between physically-similar fault
pairs (DRIFT↔BIAS, DRIFT↔NONE), not random. The `vibration_rms_x_bearing_proxy`
channel's DROPOUT class **did not learn at all** — see below, this is a data
volume problem, not something loss reweighting or more epochs can fix.

## Known limitations

- **`sensor_fault_active_vibration_rms_x_bearing_proxy` (DROPOUT) is not
  usable.** Only ~55 `sensorfaultdemodropout` runs exist in training, and
  after windowing (stride=10, forecast_horizon=60) that shrinks to a
  double-digit example count — 0/9 recall on the validation set confirms the
  model never learned this class. Do not expose DROPOUT detection on this
  channel to the advisory layer, dashboard, or Unreal until the data
  generator produces substantially more DROPOUT-class runs (dozens to low
  hundreds, matching the other `sensorfaultdemo*` classes' counts). This is a
  concrete, quantified ask for whoever owns `simulation/fault_injection/`.
- **RUL accuracy on the non-zero-RUL subset is not yet aggregated.** The
  reported `val_rul` MSE is dominated by the ~65-79% of windows where true
  RUL=0; the two tight point-checks above (−17.35s, +0.3s) are encouraging
  but anecdotal. Computing RMSE/MAE restricted to the ~23K non-zero-RUL
  validation windows (not yet done) would give the actually decision-relevant
  error bar for "how far off is the model's forecasted countdown."
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
| `engine_state_encoder.joblib` | Fitted `OneHotEncoder` for `engine_state` (12 categories) |
| `rul_scale_seconds.json` | `{"rul_scale_seconds": 3600.0}` — required to convert the model's normalized RUL output back to seconds at inference time |

Whoever wires this into `backend/app/core/model_loader.py` needs all three
files, plus the fitted `StandardScaler` (currently held only in the
notebook's runtime state, **not saved to Drive** — save it before the next
retrain, or inference can't reproduce the exact feature scaling used here).
