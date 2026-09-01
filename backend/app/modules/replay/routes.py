"""Replay: runs the bridge against a recorded run, paced to real time.
Real implementation as of Step 9's bootstrap -- see docs/build_plan.md
and the approved backend plan for the design (bridge/service.py,
bridge/sources.py)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.bridge.sources import RunNotFoundError
from app.db.base import get_db
from app.db.models import TelemetryRow
from app.modules.replay import service
from app.modules.replay.schemas import (
    LatestFrameOut,
    RunSummary,
    SessionStatusOut,
    StartReplayRequest,
    StartReplayResponse,
)

router = APIRouter(prefix="/replay", tags=["replay"])


@router.get("/runs", response_model=list[RunSummary])
async def list_runs() -> list[dict]:
    """Runs available to replay -- scans data/sample_runs/meta/*.meta.json."""
    return service.list_available_runs()


@router.post("/{run_id}/start", response_model=StartReplayResponse)
async def start_replay(run_id: str, body: StartReplayRequest) -> dict:
    try:
        bridge = service.start_session(run_id, body.speed)
    except RunNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"session_id": bridge.session_id, "run_id": run_id, "speed": body.speed}


@router.post("/{session_id}/stop")
async def stop_replay(session_id: str) -> dict:
    if not service.stop_session(session_id):
        raise HTTPException(status_code=404, detail=f"no active session {session_id!r}")
    return {"session_id": session_id, "status": "stop_requested"}


@router.get("/{session_id}/status", response_model=SessionStatusOut)
async def replay_status(session_id: str) -> dict:
    state = service.get_session_state(session_id)
    if state is None:
        raise HTTPException(status_code=404, detail=f"no session {session_id!r}")
    return {
        "session_id": state.session_id,
        "run_id": state.run_id,
        "speed": state.speed,
        "status": state.status,
        "last_t": state.last_t,
        "frames_written": state.frames_written,
        "started_at": state.started_at,
        "error": state.error,
    }


@router.get("/{session_id}/latest", response_model=LatestFrameOut)
async def latest_frame(session_id: str, db: Session = Depends(get_db)) -> TelemetryRow:
    row = db.execute(
        select(TelemetryRow).where(TelemetryRow.session_id == session_id).order_by(TelemetryRow.id.desc())
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail=f"no telemetry written yet for session {session_id!r}")
    return row
