"""The DB write path — this *is* the recorder (see docs/build_plan.md's
Step 9: "buffering, recording, replay" isn't three components, it's one
write path every frame goes through, live or replayed alike)."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.bridge.frame import EngineFrame
from app.db.models import HealthScore, Run, TelemetryRow


def ensure_run(db: Session, run_id: str, meta: dict) -> None:
    """Insert the `runs` row once per run_id, from its meta.json. No-op if
    it already exists (a run can be replayed more than once)."""
    if db.get(Run, run_id) is not None:
        return
    db.add(
        Run(
            run_id=run_id,
            engine_id=meta.get("engine_id", run_id),
            mission_id=meta.get("mission_id", run_id),
            mission_shape=meta.get("mission_shape"),
            fault_class=meta.get("fault_class"),
            accumulated_hours_at_start=meta.get("accumulated_hours_at_start"),
            n_rows=meta.get("n_rows"),
            duration_s=meta.get("duration_s"),
            export_rate_hz=meta.get("export_rate_hz"),
        )
    )
    db.commit()


def write_telemetry(db: Session, run_id: str, session_id: str, frame: EngineFrame) -> TelemetryRow:
    row = TelemetryRow(
        run_id=run_id,
        session_id=session_id,
        ts=datetime.now(timezone.utc),
        **frame.model_dump(),
    )
    db.add(row)
    db.commit()
    return row


def write_health_score(
    db: Session,
    run_id: str,
    session_id: str,
    t: float,
    fault_type: str,
    fault_probability: float,
    health_index: float,
    rul_estimate_hours: float | None,
    rul_lower: float | None,
    rul_upper: float | None,
    source: str,
    model_version: str | None,
    forecast_horizon_s: float = 0.0,
    sensor_fault_cht_c3: str | None = None,
    sensor_fault_bearing_vibration: str | None = None,
    sensor_fault_model_version: str | None = None,
) -> HealthScore:
    row = HealthScore(
        run_id=run_id,
        session_id=session_id,
        ts=datetime.now(timezone.utc),
        t=t,
        fault_type=fault_type,
        fault_probability=fault_probability,
        health_index=health_index,
        rul_estimate_hours=rul_estimate_hours,
        rul_lower=rul_lower,
        rul_upper=rul_upper,
        source=source,
        model_version=model_version,
        forecast_horizon_s=forecast_horizon_s,
        sensor_fault_cht_c3=sensor_fault_cht_c3,
        sensor_fault_bearing_vibration=sensor_fault_bearing_vibration,
        sensor_fault_model_version=sensor_fault_model_version,
    )
    db.add(row)
    db.commit()
    return row
