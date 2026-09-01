"""Ground-truth stand-in for real model inference (Phase 5). Deliberately
separate from bridge/sources.py's FrameSource — ground truth is a
simulation-only concept (see contract/ground-truth-schema.yaml's own header
on why it's kept out of the telemetry schema: real ECU data has none), so a
future live source simply has no GroundTruthLookup available and falls
through to real-model-only inference once one exists."""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd


class GroundTruthLookup:
    """Loads a replayed run's groundtruth CSV + meta.json once, and hands
    back the groundtruth row matching each replayed frame by row index —
    valid because ReplaySource iterates the telemetry file in the same
    order these were generated together in (see
    data/sample_runs/generate_fixtures.py)."""

    def __init__(self, run_id: str, data_dir: Path) -> None:
        self.run_id = run_id
        gt_path = data_dir / "groundtruth" / f"{run_id}_groundtruth.csv"
        meta_path = data_dir / "meta" / f"{run_id}.meta.json"
        self.available = gt_path.exists() and meta_path.exists()
        if self.available:
            self._df = pd.read_csv(gt_path)
            self.meta: dict = json.loads(meta_path.read_text())
        else:
            self._df = None
            self.meta = {}

    @property
    def fault_class(self) -> str:
        return self.meta.get("fault_class", "unknown")

    def row_at_index(self, i: int) -> dict | None:
        if not self.available or i >= len(self._df):
            return None
        return self._df.iloc[i].to_dict()
