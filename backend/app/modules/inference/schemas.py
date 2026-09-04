"""The fixed shape every consumer (frontend, future Unreal) reads health/
fault/RUL from. Wiring in real ml/artifacts/ (Phase 7) changes which branch
populates this and flips `source` -- the field set itself only grows via a
deliberate, documented extension (forecast_horizon_s below), never a
repurposed field."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class HealthScoreOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    run_id: str
    t: float
    fault_type: str
    fault_probability: float
    health_index: float
    rul_estimate_hours: float | None
    rul_lower: float | None
    rul_upper: float | None
    source: str  # "ground_truth" | "model"
    model_version: str | None
    # lstm_rul forecasts state this many seconds AFTER `t`, not state AT `t`
    # -- see ml/training/lstm_rul/README.md's "What it predicts, and when".
    # 0.0 for the ground-truth stand-in, which describes the current instant.
    forecast_horizon_s: float = 0.0
    # xgboost_classifier's per-channel sensor-fault classification -- a
    # DIFFERENT vocabulary from fault_type above (which is a health-
    # degradation category from lstm_rul/ground truth). "NONE"/"BIAS"/
    # "DRIFT"/"NOISE"/"STUCK" for cht_c3, "NONE"/"DROPOUT" for
    # bearing_vibration; None when xgboost_classifier's rolling-feature
    # window hasn't filled yet or no artifact is loaded -- see
    # ml/artifacts/xgboost_classifier/v1/metadata.json's label_remapping.
    sensor_fault_cht_c3: str | None = None
    sensor_fault_bearing_vibration: str | None = None
    sensor_fault_model_version: str | None = None
    # autoencoder's reconstruction-error anomaly signal -- independent of
    # fault_type/sensor_fault_* above (a third, additive vocabulary: "is
    # something generally off" rather than "which fault" or "which sensor").
    # None until this frame's engine_state is scoreable (not a gated
    # transient) and an autoencoder artifact is loaded.
    anomaly_score: float | None = None
    is_anomalous: bool | None = None
    anomaly_model_version: str | None = None
    # Per-health-parameter values feeding app/maintenance/rule_engine.py --
    # the same 16 names as contract/health-parameter-registry.md, all in its
    # 1.0=healthy->0.0=failed convention. On the model path this is the
    # lstm_rul health head's full 16-value output (health_index above is
    # just its worst entry); on the ground-truth stand-in path this only
    # contains the 1-4 columns HEALTH_COLUMNS reads for the run's known
    # fault_class -- never fabricated for parameters that path doesn't read.
    # None when neither path has any values (e.g. no ground truth, no model).
    health_parameters: dict[str, float] | None = None
