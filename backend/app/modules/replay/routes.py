"""Replay: runs the bridge against a recorded run, paced to real time.
Real implementation as of Step 9's bootstrap -- see docs/build_plan.md
and the approved backend plan for the design (bridge/service.py,
bridge/sources.py)."""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.bridge.broadcast import BroadcastTick, broadcaster
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

logger = logging.getLogger(__name__)

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
        select(TelemetryRow).where(TelemetryRow.session_id == session_id).order_by(TelemetryRow.id.desc()).limit(1)
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail=f"no telemetry written yet for session {session_id!r}")
    return row


def _tick_message(tick: BroadcastTick) -> dict:
    return {
        "type": "tick",
        "frame": tick.frame.model_dump(),
        "health": tick.health.model_dump() if tick.health is not None else None,
    }


@router.websocket("/{session_id}/stream")
async def stream_replay(websocket: WebSocket, session_id: str) -> None:
    """Pushes each {frame, health} tick (see BroadcastTick) as it's produced
    by this session's bridge loop -- the live-push counterpart to polling
    /latest + /inference/latest. Subscribes to the SAME in-process
    broadcaster BridgeService already publishes to (app/bridge/broadcast.py),
    so this route adds zero new state, only a network transport for what was
    already being produced.

    Accepts the connection even for an unknown/not-yet-started session_id --
    a client may connect slightly before the session is registered (e.g.
    immediately after POST .../start resolves) -- and simply waits for
    ticks; sends session_ended if the session is gone or finishes.
    """
    await websocket.accept()
    queue = broadcaster.subscribe(session_id)
    try:
        while True:
            state = service.get_session_state(session_id)
            if state is None:
                await websocket.send_json({"type": "session_ended", "status": "unknown"})
                break

            try:
                tick = await asyncio.wait_for(queue.get(), timeout=1.0)
            except TimeoutError:
                # No frame arrived in the last second -- re-check session
                # state (it may have finished with no further ticks coming)
                # rather than blocking forever on an empty queue.
                if state.status in ("finished", "stopped", "error"):
                    await websocket.send_json({"type": "session_ended", "status": state.status, "error": state.error})
                    break
                continue

            await websocket.send_json(_tick_message(tick))

            if state.status in ("finished", "stopped", "error") and queue.empty():
                await websocket.send_json({"type": "session_ended", "status": state.status, "error": state.error})
                break
    except WebSocketDisconnect:
        pass
    except Exception:  # noqa: BLE001 -- never let a stream bug take down the connection silently
        logger.exception("replay stream for session %s failed", session_id)
        try:
            await websocket.send_json({"type": "error", "detail": "stream failed"})
        except Exception:  # noqa: BLE001 -- best-effort notification; socket may already be gone
            pass
    finally:
        broadcaster.unsubscribe(session_id, queue)
