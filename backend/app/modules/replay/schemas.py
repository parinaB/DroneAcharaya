from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.bridge.frame import EngineFrame


class RunSummary(BaseModel):
    run_id: str
    fault_class: str | None
    mission_shape: str | None
    duration_s: float | None
    n_rows: int | None


class StartReplayRequest(BaseModel):
    speed: float = 1.0


class StartReplayResponse(BaseModel):
    session_id: str
    run_id: str
    speed: float


class SessionStatusOut(BaseModel):
    session_id: str
    run_id: str
    speed: float
    status: str
    last_t: float | None
    frames_written: int
    started_at: datetime
    error: str | None


class LatestFrameOut(EngineFrame):
    model_config = ConfigDict(from_attributes=True)

    run_id: str
    session_id: str
    ts: datetime
