"""Response shapes for MaintenanceRuleEngine.evaluate() output -- pure
data classes, no logic. Field names mirror the dict keys rule_engine.py
already emits, so FastAPI's response_model validation is a straight
pass-through, not a remapping."""

from __future__ import annotations

from pydantic import BaseModel


class MaintenanceRecommendation(BaseModel):
    component: str
    health_parameter: str
    value: float
    tier: str  # "watch" | "warning" | "critical"
    urgency: str  # "IMMEDIATE" | "URGENT" | "SCHEDULED" | "ROUTINE"
    action: str
    consequence: str
    severity_rank: int


class SensorFaultRecommendation(BaseModel):
    channel: str
    fault_type: str  # "BIAS" | "DRIFT" | "NOISE" | "STUCK" | "DROPOUT"
    action: str


class MaintenanceReport(BaseModel):
    engine_recommendations: list[MaintenanceRecommendation]
    sensor_recommendations: list[SensorFaultRecommendation]


class MaintenanceEvaluateRequest(BaseModel):
    """POST /advisory/evaluate's body -- an arbitrary health/RUL/sensor-fault
    snapshot to run through the rule engine, e.g. a client-computed
    worst-case-per-parameter aggregate across a whole run rather than a
    single HealthScore row. Never persisted -- this endpoint is a pure
    function over its input, same as MaintenanceRuleEngine.evaluate()."""

    health_parameters: dict[str, float]
    rul_hours: float | None = None
    sensor_fault_preds: dict[str, str | None] = {}
