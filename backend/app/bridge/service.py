"""BridgeService — depends only on FrameSource (sources.py), never on CSVs
or a live feed specifically. Every frame, live or replayed alike, goes
through the same write path (app/db/writer.py *is* the recorder — see its
docstring) and the same broadcast fan-out, so live and replay run identical
downstream code, per docs/build_plan.md's Step 9 design.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from app.bridge.broadcast import broadcaster
from app.bridge.sources import ReplaySource
from app.db.base import SessionLocal
from app.db.writer import ensure_run, write_health_score, write_telemetry
from app.modules.inference.ground_truth import GroundTruthLookup
from app.modules.inference.service import get_health_score

logger = logging.getLogger(__name__)


@dataclass
class SessionState:
    session_id: str
    run_id: str
    speed: float
    status: str = "starting"  # starting | running | stopped | error | finished
    last_t: float | None = None
    frames_written: int = 0
    started_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    error: str | None = None


class BridgeService:
    """Runs one replay session to completion (or until stopped),
    writing telemetry + a ground-truth-stand-in health score for every
    frame, and broadcasting each frame for any live (WS, Phase 6)
    subscriber."""

    def __init__(self, run_id: str, session_id: str, speed: float, data_dir: Path) -> None:
        self.run_id = run_id
        self.session_id = session_id
        self.state = SessionState(session_id=session_id, run_id=run_id, speed=speed)
        self._data_dir = data_dir
        self._source = ReplaySource(run_id, data_dir, speed=speed)
        self._ground_truth = GroundTruthLookup(run_id, data_dir)
        self._stop_requested = False

    def stop(self) -> None:
        self._stop_requested = True

    async def run(self) -> None:
        db = SessionLocal()
        try:
            meta_path = self._data_dir / "meta" / f"{self.run_id}.meta.json"
            meta = json.loads(meta_path.read_text()) if meta_path.exists() else {"run_id": self.run_id}
            ensure_run(db, self.run_id, meta)

            self.state.status = "running"
            i = 0
            async for frame in self._source.frames():
                if self._stop_requested:
                    self.state.status = "stopped"
                    return

                write_telemetry(db, self.run_id, self.session_id, frame)
                broadcaster.publish(self.session_id, frame)

                groundtruth_row = self._ground_truth.row_at_index(i)
                health = get_health_score(self._ground_truth.fault_class, groundtruth_row)
                write_health_score(
                    db,
                    self.run_id,
                    self.session_id,
                    frame.t,
                    **health,
                )

                self.state.last_t = frame.t
                self.state.frames_written += 1
                i += 1

            self.state.status = "finished"
        except Exception as exc:  # noqa: BLE001 -- surface any failure via /status, don't crash the app
            logger.exception("bridge session %s failed", self.session_id)
            self.state.status = "error"
            self.state.error = str(exc)
        finally:
            db.close()
