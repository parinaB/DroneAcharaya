"""The fixed shape every consumer (frontend, future Unreal) reads health/
fault/RUL from. Wiring in real ml/artifacts/ later (Phase 7) only changes
which branch populates this and flips `source` — never this contract."""

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
