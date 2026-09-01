"""In-memory session registry for replay sessions. Deliberately not
persisted anywhere beyond the process — restarting the backend loses
active sessions, which is fine for a single-demo-session bridge (see
ops/infra/README.md); the DB rows a session wrote stay put either way."""

from __future__ import annotations

import asyncio
import json
import uuid
from pathlib import Path

from app.bridge.service import BridgeService, SessionState
from app.core.config import get_settings

_sessions: dict[str, tuple[BridgeService, asyncio.Task]] = {}


def _sample_runs_dir() -> Path:
    return get_settings().data_dir / "sample_runs"


def list_available_runs() -> list[dict]:
    meta_dir = _sample_runs_dir() / "meta"
    if not meta_dir.exists():
        return []
    runs = []
    for meta_path in sorted(meta_dir.glob("*.meta.json")):
        meta = json.loads(meta_path.read_text())
        runs.append(
            {
                "run_id": meta.get("run_id", meta_path.stem.removesuffix(".meta")),
                "fault_class": meta.get("fault_class"),
                "mission_shape": meta.get("mission_shape"),
                "duration_s": meta.get("duration_s"),
                "n_rows": meta.get("n_rows"),
            }
        )
    return runs


def start_session(run_id: str, speed: float) -> BridgeService:
    session_id = str(uuid.uuid4())
    service = BridgeService(run_id, session_id, speed, _sample_runs_dir())
    task = asyncio.create_task(service.run())
    _sessions[session_id] = (service, task)
    return service


def stop_session(session_id: str) -> bool:
    entry = _sessions.get(session_id)
    if entry is None:
        return False
    service, _task = entry
    service.stop()
    return True


def get_session_state(session_id: str) -> SessionState | None:
    entry = _sessions.get(session_id)
    return entry[0].state if entry else None


def active_session_count() -> int:
    return len(_sessions)
