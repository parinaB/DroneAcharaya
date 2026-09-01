"""Where frames come from — the Step 9 "seam where Simulink engine later
swaps to real ECU." BridgeService (service.py) depends only on the
FrameSource protocol, never on CSVs or a live feed specifically, so a
future LiveEcuSource implements the same protocol and swaps in via config
with zero change to validation, DB-write, or broadcast code.
"""

from __future__ import annotations

import asyncio
import math
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Protocol

import pandas as pd

from app.bridge.frame import EngineFrame

_FRAME_COLUMNS = list(EngineFrame.model_fields.keys())


class FrameSource(Protocol):
    """Anything that can produce a stream of engine frames — a replayed
    file today, a live ECU/CAN feed later."""

    def frames(self) -> AsyncIterator[EngineFrame]: ...


class RunNotFoundError(Exception):
    pass


def _nan_to_none(value: object) -> object:
    if isinstance(value, float) and math.isnan(value):
        return None
    return value


class ReplaySource:
    """Reads a data/sample_runs (or, later, data/processed) run's
    telemetry CSV row-by-row, paced to real time by the row's own `t`
    deltas times a speed multiplier. Stamps data_origin=REPLAY regardless
    of what the source file says, since replaying it is what's actually
    happening right now.
    """

    def __init__(self, run_id: str, data_dir: Path, speed: float = 1.0) -> None:
        if speed <= 0:
            raise ValueError("speed must be > 0")
        self.run_id = run_id
        self.speed = speed
        self._telemetry_path = data_dir / "telemetry" / f"{run_id}.csv"
        if not self._telemetry_path.exists():
            raise RunNotFoundError(f"no telemetry file for run_id={run_id!r} at {self._telemetry_path}")
        self._df = pd.read_csv(self._telemetry_path)

    async def frames(self) -> AsyncIterator[EngineFrame]:
        prev_t: float | None = None
        for _, row in self._df.iterrows():
            if prev_t is not None:
                delay = max(0.0, (row["t"] - prev_t) / self.speed)
                if delay:
                    await asyncio.sleep(delay)
            prev_t = row["t"]

            values = {col: _nan_to_none(row.get(col)) for col in _FRAME_COLUMNS}
            values["data_origin"] = "REPLAY"
            yield EngineFrame(**values)
