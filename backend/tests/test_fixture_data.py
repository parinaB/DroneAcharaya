"""Sanity checks on data/sample_runs/ — the committed fixtures the bridge
replays against locally and in tests. Skips (doesn't fail) for any run_id
whose files don't exist yet, rather than requiring a specific fixture set —
see data/sample_runs/README.md for the layout this expects once real runs
are dropped in."""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
import pytest

SAMPLE_RUNS_DIR = Path(__file__).resolve().parents[2] / "data" / "sample_runs"

TELEMETRY_COLUMNS = {
    "t",
    "rpm",
    "torque",
    "power",
    "engine_load",
    "cht_c1",
    "cht_c2",
    "cht_c3",
    "cht_c4",
    "egt_c1",
    "egt_c2",
    "egt_c3",
    "egt_c4",
    "oil_pressure",
    "oil_temperature",
    "fuel_flow",
    "rail_pressure",
    "injection_timing",
    "boost_pressure",
    "map",
    "intake_temperature",
    "air_mass_flow",
    "coolant_temperature",
    "vibration_rms_x",
    "vibration_order_1x",
    "vibration_rms_x_bearing_proxy",
    "vibration_order_1x_bearing_proxy",
    "battery_voltage",
    "battery_current",
    "alternator_power",
    "altitude",
    "ambient_pressure",
    "ambient_temperature",
    "air_density",
    "throttle",
    "engine_state",
    "engine_id",
    "mission_id",
    "data_origin",
}


def _discover_run_ids() -> list[str]:
    telemetry_dir = SAMPLE_RUNS_DIR / "telemetry"
    if not telemetry_dir.exists():
        return []
    return sorted(p.stem for p in telemetry_dir.glob("*.csv"))


RUN_IDS = _discover_run_ids()
pytestmark = pytest.mark.skipif(
    not RUN_IDS,
    reason="data/sample_runs/ is empty — see its README for the layout to drop real runs into",
)


@pytest.fixture(params=RUN_IDS)
def run_id(request: pytest.FixtureRequest) -> str:
    return request.param


def test_telemetry_file_has_documented_columns(run_id: str) -> None:
    df = pd.read_csv(SAMPLE_RUNS_DIR / "telemetry" / f"{run_id}.csv")
    assert set(df.columns) == TELEMETRY_COLUMNS
    assert len(df) > 0


def test_time_is_monotonic(run_id: str) -> None:
    df = pd.read_csv(SAMPLE_RUNS_DIR / "telemetry" / f"{run_id}.csv")
    assert (df["t"].diff().dropna() > 0).all()


def test_only_cht_c3_carries_a_sensor_fault_path(run_id: str) -> None:
    """data/README.md: every other telemetry channel equals its groundtruth
    `_true` value exactly."""
    telemetry = pd.read_csv(SAMPLE_RUNS_DIR / "telemetry" / f"{run_id}.csv")
    groundtruth = pd.read_csv(SAMPLE_RUNS_DIR / "groundtruth" / f"{run_id}_groundtruth.csv")
    for col in ["cht_c1", "egt_c1", "oil_pressure", "fuel_flow", "rpm"]:
        assert (telemetry[col].to_numpy() == groundtruth[f"{col}_true"].to_numpy()).all(), col


def test_cross_signal_identities_hold(run_id: str) -> None:
    df = pd.read_csv(SAMPLE_RUNS_DIR / "telemetry" / f"{run_id}.csv")
    assert (df["map"] - (df["ambient_pressure"] + df["boost_pressure"])).abs().max() < 1e-6
    expected_power = df["torque"] * df["rpm"] * 2 * 3.141592653589793 / 60 / 1000
    assert (df["power"] - expected_power).abs().max() < 1e-6


def test_meta_json_matches_row_count(run_id: str) -> None:
    meta = json.loads((SAMPLE_RUNS_DIR / "meta" / f"{run_id}.meta.json").read_text())
    df = pd.read_csv(SAMPLE_RUNS_DIR / "telemetry" / f"{run_id}.csv")
    assert meta["n_rows"] == len(df)
    assert meta["run_id"] == run_id
