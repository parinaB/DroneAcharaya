"""Advisory: turns model/ground-truth output into ranked maintenance
actions via app/maintenance/rule_engine.py, per contract/maintenance-rules.yaml.
Raw predictions (health_index, fault_type, sensor_fault_*) aren't replaced --
this is an additive interpretation layer on top of the same HealthScore row
/inference/latest already reads."""

from __future__ import annotations

from functools import lru_cache

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.base import get_db
from app.db.models import HealthScore
from app.maintenance.rule_engine import MaintenanceRuleEngine, MaintenanceRuleEngineError
from app.maintenance.schemas import MaintenanceEvaluateRequest, MaintenanceReport

router = APIRouter(prefix="/advisory", tags=["advisory"])


@lru_cache
def get_rule_engine() -> MaintenanceRuleEngine:
    settings = get_settings()
    rules_path = settings.data_dir.parent / "contract" / "maintenance-rules.yaml"
    return MaintenanceRuleEngine(rules_path)


@router.get("/latest", response_model=MaintenanceReport)
async def latest_advisory(
    session_id: str = Query(..., description="A replay session_id from POST /replay/{run_id}/start"),
    db: Session = Depends(get_db),
    engine: MaintenanceRuleEngine = Depends(get_rule_engine),
) -> MaintenanceReport:
    row = db.execute(
        select(HealthScore).where(HealthScore.session_id == session_id).order_by(HealthScore.id.desc()).limit(1)
    ).scalar_one_or_none()

    if row is None or not row.health_parameters:
        return MaintenanceReport(engine_recommendations=[], sensor_recommendations=[])

    sensor_fault_preds = {
        "cht_c3": row.sensor_fault_cht_c3,
        "bearing_vibration": row.sensor_fault_bearing_vibration,
    }
    report = engine.evaluate(row.health_parameters, row.rul_estimate_hours, sensor_fault_preds)
    return MaintenanceReport(**report)


@router.post("/evaluate", response_model=MaintenanceReport)
async def evaluate_advisory(
    body: MaintenanceEvaluateRequest,
    engine: MaintenanceRuleEngine = Depends(get_rule_engine),
) -> MaintenanceReport:
    """Runs the rule engine against an arbitrary snapshot instead of the
    latest HealthScore row -- e.g. a client-computed worst-value-per-
    parameter aggregate across an entire run, so every fault that was ever
    critical shows up, not just whichever one was active in the last frame.
    """
    try:
        report = engine.evaluate(body.health_parameters, body.rul_hours, body.sensor_fault_preds)
    except MaintenanceRuleEngineError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return MaintenanceReport(**report)
