"""ORM models for the bridge's write path (Step 9).

Column set for TelemetryRow matches data/README.md's documented
telemetry/<run_id>.csv table exactly -- see that file for units/meaning of
each field. Kept as real typed columns (not a JSON blob) because the API/
frontend need strongly-typed values, not a table any consumer has to parse.

No hypertables/partitioning here -- see ops/infra/README.md for why
TimescaleDB was dropped (Supabase's free tier doesn't support the
extension). At this project's data volume (a handful of short replayed
missions, not a fleet), plain indexed tables are the honest fit; revisit
partitioning only if that scale assumption stops holding.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Run(Base):
    """One replayed (or, later, live) mission — mirrors a
    data/sample_runs or data/processed <run_id>.meta.json."""

    __tablename__ = "runs"

    run_id: Mapped[str] = mapped_column(String, primary_key=True)
    engine_id: Mapped[str] = mapped_column(String)
    mission_id: Mapped[str] = mapped_column(String)
    mission_shape: Mapped[str | None] = mapped_column(String, nullable=True)
    fault_class: Mapped[str | None] = mapped_column(String, nullable=True)
    accumulated_hours_at_start: Mapped[float | None] = mapped_column(Float, nullable=True)
    n_rows: Mapped[int | None] = mapped_column(Integer, nullable=True)
    duration_s: Mapped[float | None] = mapped_column(Float, nullable=True)
    export_rate_hz: Mapped[float | None] = mapped_column(Float, nullable=True)
    source_path: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class TelemetryRow(Base):
    """One replayed frame. (run_id, ts) is the natural key; a surrogate
    integer PK is used instead so out-of-order/duplicate writes during
    development don't fail a composite-PK constraint."""

    __tablename__ = "telemetry"
    __table_args__ = (Index("ix_telemetry_run_ts", "run_id", "ts"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("runs.run_id"))
    session_id: Mapped[str] = mapped_column(String)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True))  # wall-clock write time
    t: Mapped[float] = mapped_column(Float)  # mission-elapsed seconds, from the source file
    data_origin: Mapped[str] = mapped_column(String)  # SIMULATED | REPLAY | REAL_ECU

    rpm: Mapped[float] = mapped_column(Float)
    torque: Mapped[float] = mapped_column(Float)
    power: Mapped[float] = mapped_column(Float)
    engine_load: Mapped[float] = mapped_column(Float)

    cht_c1: Mapped[float] = mapped_column(Float)
    cht_c2: Mapped[float] = mapped_column(Float)
    cht_c3: Mapped[float] = mapped_column(Float)
    cht_c4: Mapped[float] = mapped_column(Float)
    egt_c1: Mapped[float] = mapped_column(Float)
    egt_c2: Mapped[float] = mapped_column(Float)
    egt_c3: Mapped[float] = mapped_column(Float)
    egt_c4: Mapped[float] = mapped_column(Float)

    oil_pressure: Mapped[float] = mapped_column(Float)
    oil_temperature: Mapped[float] = mapped_column(Float)
    fuel_flow: Mapped[float] = mapped_column(Float)
    rail_pressure: Mapped[float] = mapped_column(Float)
    injection_timing: Mapped[float] = mapped_column(Float)
    boost_pressure: Mapped[float] = mapped_column(Float)
    map: Mapped[float] = mapped_column(Float)
    intake_temperature: Mapped[float] = mapped_column(Float)
    air_mass_flow: Mapped[float] = mapped_column(Float)
    coolant_temperature: Mapped[float] = mapped_column(Float)

    vibration_rms_x: Mapped[float | None] = mapped_column(Float, nullable=True)
    vibration_order_1x: Mapped[float | None] = mapped_column(Float, nullable=True)
    vibration_rms_x_bearing_proxy: Mapped[float] = mapped_column(Float)
    vibration_order_1x_bearing_proxy: Mapped[float] = mapped_column(Float)

    battery_voltage: Mapped[float] = mapped_column(Float)
    battery_current: Mapped[float] = mapped_column(Float)
    alternator_power: Mapped[float] = mapped_column(Float)

    altitude: Mapped[float] = mapped_column(Float)
    ambient_pressure: Mapped[float] = mapped_column(Float)
    ambient_temperature: Mapped[float] = mapped_column(Float)
    air_density: Mapped[float] = mapped_column(Float)

    throttle: Mapped[float] = mapped_column(Float)
    engine_state: Mapped[str] = mapped_column(String)


class ResidualRow(Base):
    """measured - expected per channel, from
    ml/features/feature_engineering.py's physics_residuals(). Stored as a
    JSON dict ({channel: value}) rather than one column per
    fit_digital_twin.py TARGET_CHANNEL, since that list is metadata-driven
    (ml/artifacts/digital_twin/<version>/metadata.json), not fixed at
    schema-design time. All-NULL rows are expected and fine when no digital
    twin artifact is loaded yet."""

    __tablename__ = "residuals"
    __table_args__ = (Index("ix_residuals_run_ts", "run_id", "ts"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("runs.run_id"))
    session_id: Mapped[str] = mapped_column(String)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    t: Mapped[float] = mapped_column(Float)
    values: Mapped[dict | None] = mapped_column(JSON, nullable=True)


class HealthScore(Base):
    """The fixed-shape output every consumer (frontend, future Unreal)
    reads from — see backend/app/modules/inference/schemas.py's
    HealthScoreOut, which this table mirrors. `source` distinguishes the
    current ground-truth stand-in from a real model's output later; neither
    the API contract nor this table changes shape when that flips."""

    __tablename__ = "health_scores"
    __table_args__ = (Index("ix_health_scores_run_ts", "run_id", "ts"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("runs.run_id"))
    session_id: Mapped[str] = mapped_column(String)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    t: Mapped[float] = mapped_column(Float)

    fault_type: Mapped[str] = mapped_column(String)
    fault_probability: Mapped[float] = mapped_column(Float)
    health_index: Mapped[float] = mapped_column(Float)
    rul_estimate_hours: Mapped[float | None] = mapped_column(Float, nullable=True)
    rul_lower: Mapped[float | None] = mapped_column(Float, nullable=True)
    rul_upper: Mapped[float | None] = mapped_column(Float, nullable=True)
    source: Mapped[str] = mapped_column(String)  # "ground_truth" | "model"
    model_version: Mapped[str | None] = mapped_column(String, nullable=True)
    # 0.0 for ground_truth (describes t itself); lstm_rul forecasts t+60s --
    # see HealthScoreOut's own docstring for why this isn't a repurposed field.
    forecast_horizon_s: Mapped[float] = mapped_column(Float, default=0.0)
    # xgboost_classifier's per-channel sensor-fault classification -- see
    # HealthScoreOut's own docstring for why this is a separate field from
    # fault_type, not merged into it.
    sensor_fault_cht_c3: Mapped[str | None] = mapped_column(String, nullable=True)
    sensor_fault_bearing_vibration: Mapped[str | None] = mapped_column(String, nullable=True)
    sensor_fault_model_version: Mapped[str | None] = mapped_column(String, nullable=True)


class AdvisoryState(Base):
    """Operator ack/dismiss workflow state — relational, not a time series,
    per the approved backend plan's schema split."""

    __tablename__ = "advisory_state"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("runs.run_id"))
    session_id: Mapped[str] = mapped_column(String)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    advisory_text: Mapped[str] = mapped_column(String)
    severity: Mapped[str | None] = mapped_column(String, nullable=True)
    acknowledged: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
