"""BridgeService — depends only on FrameSource (sources.py), never on CSVs
or a live feed specifically. Every frame, live or replayed alike, goes
through the same write path (app/db/writer.py *is* the recorder — see its
docstring) and the same broadcast fan-out, so live and replay run identical
downstream code, per docs/build_plan.md's Step 9 design.

Phase 7: also maintains a rolling window of the last LSTM_SEQ_LEN frames --
shared by both lstm_rul (needs the full window) and xgboost_classifier
(row-level, but its rolling features need history too; gated on its own,
shorter XGB_ROLLING_WINDOW so it starts producing sensor_fault_* output well
before lstm_rul's 60-frame cold start ends). Before each model's own window
threshold, and whenever its artifact isn't present, falls through to the
ground-truth stand-in (lstm_rul's fault_type/health_index/rul) or None
(xgboost_classifier's sensor_fault_* fields) -- a session is never left
without a HealthScore row.
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from app.bridge.broadcast import broadcaster
from app.bridge.sources import ReplaySource
from app.core.config import get_settings
from app.core.model_loader import LSTM_SEQ_LEN, XGB_ROLLING_WINDOW
from app.db.base import SessionLocal
from app.db.writer import ensure_run, write_health_score, write_telemetry
from app.modules.inference.ground_truth import GroundTruthLookup
from app.modules.inference.service import (
    get_health_score,
    try_load_autoencoder_bundle,
    try_load_lstm_bundle,
    try_load_xgboost_bundle,
)

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
    """Runs one replay session to completion (or until stopped), writing
    telemetry + a health score (real lstm_rul model once its rolling window
    fills, ground-truth stand-in until then) for every frame, and
    broadcasting each frame for any live (WS, Phase 6) subscriber."""

    def __init__(self, run_id: str, session_id: str, speed: float, data_dir: Path) -> None:
        self.run_id = run_id
        self.session_id = session_id
        self.state = SessionState(session_id=session_id, run_id=run_id, speed=speed)
        self._data_dir = data_dir
        self._source = ReplaySource(run_id, data_dir, speed=speed)
        self._ground_truth = GroundTruthLookup(run_id, data_dir)
        self._stop_requested = False

        settings = get_settings()
        self._lstm_bundle = try_load_lstm_bundle(str(settings.artifacts_dir), settings.lstm_rul_version)
        self._xgb_bundle = try_load_xgboost_bundle(str(settings.artifacts_dir), settings.xgboost_classifier_version)
        self._ae_bundle = try_load_autoencoder_bundle(str(settings.artifacts_dir), settings.autoencoder_version)
        # Shared buffer: lstm_rul needs the full LSTM_SEQ_LEN window;
        # xgboost_classifier is row-level but its rolling features need
        # history too, gated separately below on the shorter XGB_ROLLING_WINDOW.
        self._frame_window: deque = deque(maxlen=LSTM_SEQ_LEN)

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
                self._frame_window.append(frame)

                groundtruth_row = self._ground_truth.row_at_index(i)
                lstm_ready = self._lstm_bundle is not None and len(self._frame_window) == LSTM_SEQ_LEN
                xgb_ready = self._xgb_bundle is not None and len(self._frame_window) >= XGB_ROLLING_WINDOW
                # get_health_score() runs real torch/xgboost forward passes
                # once each model's window is ready -- offload to a worker
                # thread so neither blocks this coroutine's event loop.
                health = await asyncio.to_thread(
                    get_health_score,
                    self._ground_truth.fault_class,
                    groundtruth_row,
                    lstm_bundle=self._lstm_bundle if lstm_ready else None,
                    lstm_window=list(self._frame_window) if lstm_ready else None,
                    xgb_bundle=self._xgb_bundle if xgb_ready else None,
                    xgb_window=list(self._frame_window) if xgb_ready else None,
                    ae_bundle=self._ae_bundle,
                    ae_frame=frame if self._ae_bundle is not None else None,
                )
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
