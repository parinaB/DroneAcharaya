"""Inference: get_health_score() is the one function that decides between
real trained models and the ground-truth stand-in.

Phase 7: lstm_rul's health + RUL heads and xgboost_classifier's per-channel
sensor-fault classification are both wired (see model_loader.py's module
docstring for why lstm_rul's own sensor-fault head is deliberately excluded
in favor of xgboost_classifier). fault_type/fault_probability from the
lstm_rul path reuse HEALTH_COLUMNS' own worst-column-wins logic, just fed
the model's predicted health values instead of ground truth -- same
aggregation, different source. xgboost_classifier's output is a separate
vocabulary (sensor_fault_cht_c3/sensor_fault_bearing_vibration) and is never
merged into fault_type -- see HealthScoreOut's own docstring for why.
"""

from __future__ import annotations

from app.core.model_loader import (
    LSTM_FORECAST_HORIZON_S,
    XGB_BEARING_ID_TO_CLASS,
    XGB_CHT_C3_ID_TO_CLASS,
    AutoencoderBundle,
    LstmRulBundle,
    ModelArtifactError,
    XgboostClassifierBundle,
    load_autoencoder_bundle,
    load_lstm_rul_bundle,
    load_xgboost_classifier_bundle,
)

# fault_class -> (direction, groundtruth columns), per
# contract/health-parameter-registry.md's two conventions:
#   "health": 1.0 = healthy -> 0.0 = failed (use the worst/minimum column)
#   "deg":    0.0 = healthy -> 1.0 = failed (invert the worst/maximum column)
HEALTH_COLUMNS: dict[str, tuple[str, list[str]]] = {
    "injector_degradation": (
        "health",
        ["injector_health_c1", "injector_health_c2", "injector_health_c3", "injector_health_c4"],
    ),
    "cooling_degradation": ("health", ["cooling_health"]),
    "oil_pump_degradation": ("health", ["oil_pump_health"]),
    "bearing_wear": ("health", ["bearing_health"]),
    "mechanical_vibration": ("health", ["bearing_health"]),
    "fuel_starvation": ("health", ["fuel_delivery_health"]),
    "alternator_degradation": ("health", ["alternator_health"]),
    "turbo_degradation": ("deg", ["turbo_efficiency_deg"]),
    "injection_timing_drift": ("deg", ["injection_timing_deg"]),
    "combustion_instability": ("deg", ["combustion_stability"]),
    "misfire": ("deg", ["misfire_rate_c1", "misfire_rate_c2", "misfire_rate_c3", "misfire_rate_c4"]),
}

# EngineMultiHeadLSTM's health head output order (TARGET_HEALTH_COLUMNS in
# lstm_training.ipynb = HEALTH_1_TO_0_COLUMNS + HEALTH_0_TO_1_COLUMNS), all
# already in the 1.0=healthy -> 0.0=failed convention post-sign-flip -- so
# every entry below uses "health" direction regardless of the column's
# pre-flip name, unlike HEALTH_COLUMNS above which mixes raw ground-truth
# conventions.
LSTM_HEALTH_PARAM_ORDER: list[str] = [
    "injector_health_c1",
    "injector_health_c2",
    "injector_health_c3",
    "injector_health_c4",
    "cooling_health",
    "oil_pump_health",
    "bearing_health",
    "fuel_delivery_health",
    "alternator_health",
    "turbo_efficiency_deg",
    "injection_timing_deg",
    "combustion_stability",
    "misfire_rate_c1",
    "misfire_rate_c2",
    "misfire_rate_c3",
    "misfire_rate_c4",
]

# Worst (lowest) named health parameter -> the fault_class label a human
# reading fault_type would expect, mirroring HEALTH_COLUMNS' vocabulary so
# ground-truth and model outputs read the same way downstream.
_HEALTH_PARAM_TO_FAULT_CLASS: dict[str, str] = {
    "injector_health_c1": "injector_degradation",
    "injector_health_c2": "injector_degradation",
    "injector_health_c3": "injector_degradation",
    "injector_health_c4": "injector_degradation",
    "cooling_health": "cooling_degradation",
    "oil_pump_health": "oil_pump_degradation",
    "bearing_health": "bearing_wear",
    "fuel_delivery_health": "fuel_starvation",
    "alternator_health": "alternator_degradation",
    "turbo_efficiency_deg": "turbo_degradation",
    "injection_timing_deg": "injection_timing_drift",
    "combustion_stability": "combustion_instability",
    "misfire_rate_c1": "misfire",
    "misfire_rate_c2": "misfire",
    "misfire_rate_c3": "misfire",
    "misfire_rate_c4": "misfire",
}


def ground_truth_health_score(fault_class: str, groundtruth_row: dict) -> tuple[float, float]:
    """Returns (health_index 0-100, fault_probability 0-1) from a single
    groundtruth row. Never fabricates a score for an unrecognized
    fault_class — returns full health instead, since making something up
    would be worse than admitting the mapping doesn't cover it yet."""
    if fault_class in (None, "healthy", "none"):
        return 100.0, 0.0
    spec = HEALTH_COLUMNS.get(fault_class)
    if spec is None:
        return 100.0, 0.0
    direction, columns = spec
    values = [groundtruth_row[c] for c in columns if c in groundtruth_row]
    if not values:
        return 100.0, 0.0
    fraction = min(values) if direction == "health" else 1.0 - max(values)
    fraction = max(0.0, min(1.0, fraction))
    return fraction * 100.0, round(1.0 - fraction, 4)


def model_health_score(health_pred: list[float]) -> tuple[str, float, float]:
    """Returns (fault_type, fault_probability, health_index) from
    EngineMultiHeadLSTM's 16-value health head output, in
    LSTM_HEALTH_PARAM_ORDER. Same worst-column-wins aggregation as
    ground_truth_health_score, just applied to predicted values."""
    worst_idx = min(range(len(health_pred)), key=lambda i: health_pred[i])
    worst_value = max(0.0, min(1.0, health_pred[worst_idx]))
    worst_param = LSTM_HEALTH_PARAM_ORDER[worst_idx]
    fault_type = _HEALTH_PARAM_TO_FAULT_CLASS[worst_param] if worst_value < 1.0 else "none"
    return fault_type, round(1.0 - worst_value, 4), worst_value * 100.0


def xgboost_sensor_fault_score(bundle: XgboostClassifierBundle, window: list) -> dict:
    """Returns the three sensor_fault_* fields from xgboost_classifier's two
    per-channel models, applied to the same rolling window BridgeService
    already buffers for lstm_rul (see xgboost_features.py's module
    docstring for why the buffer needs to be longer than the 10s rolling
    window the features themselves use). Uses predict_proba().argmax()
    rather than .predict() -- a loaded-from-JSON XGBClassifier's .predict()
    is not reliably class-label output for a 2-class model across xgboost
    versions (confirmed empirically against this exact artifact); argmax
    over predict_proba's shape is unambiguous regardless."""
    from app.modules.inference.xgboost_features import build_xgboost_features

    x = build_xgboost_features(window)
    cht_c3_id = int(bundle.cht_c3_model.predict_proba(x)[0].argmax())
    bearing_id = int(bundle.bearing_model.predict_proba(x)[0].argmax())
    return {
        "sensor_fault_cht_c3": XGB_CHT_C3_ID_TO_CLASS[cht_c3_id],
        "sensor_fault_bearing_vibration": XGB_BEARING_ID_TO_CLASS[bearing_id],
        "sensor_fault_model_version": f"xgboost_classifier/{bundle.version}",
    }


def autoencoder_anomaly_score(bundle: AutoencoderBundle, frame) -> dict:
    """Returns the three anomaly_* fields from the autoencoder's
    reconstruction error on one telemetry frame. Row-level -- no rolling
    window needed, unlike lstm_rul/xgboost_classifier -- but returns all-None
    if the frame's engine_state is a gated transient or a needed channel is
    NaN (see autoencoder_features.py's build_autoencoder_features)."""
    import torch

    from app.modules.inference.autoencoder_features import build_autoencoder_features

    x = build_autoencoder_features(bundle, frame)
    if x is None:
        return {"anomaly_score": None, "is_anomalous": None, "anomaly_model_version": None}

    with torch.no_grad():
        x_t = torch.from_numpy(x)
        reconstruction = bundle.model(x_t)
        error = torch.mean((reconstruction - x_t) ** 2).item()

    return {
        "anomaly_score": round(error, 6),
        "is_anomalous": error > bundle.threshold,
        "anomaly_model_version": f"autoencoder/{bundle.version}",
    }


def get_health_score(
    fault_class: str,
    groundtruth_row: dict | None,
    *,
    lstm_bundle: LstmRulBundle | None = None,
    lstm_window: list | None = None,
    xgb_bundle: XgboostClassifierBundle | None = None,
    xgb_window: list | None = None,
    ae_bundle: AutoencoderBundle | None = None,
    ae_frame=None,
) -> dict:
    """Returns the fields HealthScoreOut/HealthScore need, minus run_id/t
    (the caller already has those).

    Runs the real lstm_rul model when a full window (`lstm_window`, exactly
    LSTM_SEQ_LEN frames) and a loaded `lstm_bundle` are both provided;
    otherwise falls through to the ground-truth stand-in (early frames of a
    session, before the rolling window has filled, or any source with no
    ground truth and no model). xgboost_classifier's sensor_fault_* fields
    and the autoencoder's anomaly_* fields are each computed independently
    of that choice (when their bundle/window-or-frame args are both
    provided) and merged into whichever base result applies -- they're
    additive signals, not alternative sources for the same fields as
    fault_type/health_index/rul_estimate_hours.
    """
    if lstm_bundle is not None and lstm_window is not None:
        import torch

        from app.modules.inference.lstm_features import build_lstm_input

        with torch.no_grad():
            x = build_lstm_input(lstm_bundle, lstm_window)
            health_pred, rul_pred, _sensor_fault_logits, _attn = lstm_bundle.model(x)

        fault_type, fault_probability, health_index = model_health_score(health_pred[0].tolist())
        rul_seconds = float(rul_pred.item()) * lstm_bundle.rul_scale_seconds
        result = {
            "fault_type": fault_type,
            "fault_probability": fault_probability,
            "health_index": health_index,
            "rul_estimate_hours": rul_seconds / 3600.0,
            "rul_lower": None,
            "rul_upper": None,
            "source": "model",
            "model_version": f"lstm_rul/{lstm_bundle.version}",
            "forecast_horizon_s": LSTM_FORECAST_HORIZON_S,
        }
    elif groundtruth_row is None:
        # No ground truth available (e.g. a live/non-fixture source) and no
        # model either -- honestly report "unknown", don't fabricate.
        result = {
            "fault_type": "unknown",
            "fault_probability": 0.0,
            "health_index": 100.0,
            "rul_estimate_hours": None,
            "rul_lower": None,
            "rul_upper": None,
            "source": "ground_truth",
            "model_version": None,
            "forecast_horizon_s": 0.0,
        }
    else:
        health_index, fault_probability = ground_truth_health_score(fault_class, groundtruth_row)
        result = {
            "fault_type": fault_class or "none",
            "fault_probability": fault_probability,
            "health_index": health_index,
            # RUL formula isn't formalized in the ground-truth stand-in path
            # -- left None rather than invented here. A real value is
            # available once the rolling window fills and lstm_rul takes over.
            "rul_estimate_hours": None,
            "rul_lower": None,
            "rul_upper": None,
            "source": "ground_truth",
            "model_version": None,
            "forecast_horizon_s": 0.0,
        }

    if xgb_bundle is not None and xgb_window is not None:
        result.update(xgboost_sensor_fault_score(xgb_bundle, xgb_window))
    else:
        result.update(
            {
                "sensor_fault_cht_c3": None,
                "sensor_fault_bearing_vibration": None,
                "sensor_fault_model_version": None,
            }
        )

    if ae_bundle is not None and ae_frame is not None:
        result.update(autoencoder_anomaly_score(ae_bundle, ae_frame))
    else:
        result.update({"anomaly_score": None, "is_anomalous": None, "anomaly_model_version": None})

    return result


def try_load_lstm_bundle(artifacts_dir: str, version: str = "v1") -> LstmRulBundle | None:
    """Best-effort load -- returns None (not an exception) if the artifact
    directory doesn't exist yet, so BridgeService can run against
    ground-truth-only fixtures without a trained model present."""
    try:
        return load_lstm_rul_bundle(artifacts_dir, version)
    except ModelArtifactError:
        return None


def try_load_xgboost_bundle(artifacts_dir: str, version: str = "v1") -> XgboostClassifierBundle | None:
    """Best-effort load -- returns None (not an exception) if the artifact
    directory doesn't exist yet."""
    try:
        return load_xgboost_classifier_bundle(artifacts_dir, version)
    except ModelArtifactError:
        return None


def try_load_autoencoder_bundle(artifacts_dir: str, version: str = "v3") -> AutoencoderBundle | None:
    """Best-effort load -- returns None (not an exception) if the artifact
    directory or its paired digital_twin directory doesn't exist yet."""
    try:
        return load_autoencoder_bundle(artifacts_dir, version)
    except ModelArtifactError:
        return None
