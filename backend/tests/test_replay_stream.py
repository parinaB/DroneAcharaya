"""Integration test for the /replay/{session_id}/stream WebSocket route --
the live-push counterpart to polling /latest + /inference/latest, added for
the Three.js visualization's useTelemetryStream hook. Skips if
data/sample_runs/ has no fixtures (same convention as test_fixture_data.py)."""

from __future__ import annotations

import os
from pathlib import Path

import pytest
from app.main import app
from fastapi.testclient import TestClient

BACKEND_DIR = Path(__file__).resolve().parents[1]
SAMPLE_RUNS_DIR = BACKEND_DIR.parent / "data" / "sample_runs"
RUN_IDS = (
    sorted(p.stem for p in (SAMPLE_RUNS_DIR / "telemetry").glob("*.csv"))
    if (SAMPLE_RUNS_DIR / "telemetry").exists()
    else []
)

pytestmark = pytest.mark.skipif(not RUN_IDS, reason="data/sample_runs/ is empty")


@pytest.fixture(autouse=True)
def _run_from_backend_dir():
    """app.core.config.Settings' filesystem-root defaults (data_dir,
    artifacts_dir) are documented as CWD-relative, assuming `cd backend &&
    uvicorn ...` per that module's own comment -- true for every deployment
    path, but not for pytest invoked from the repo root (this file's own
    RUN_IDS above already resolves absolutely to sidestep that for fixture
    discovery). Only this test file actually exercises POST /start, which
    resolves data_dir at request time, so only here does the CWD need to
    genuinely be backend/ rather than just computing paths absolutely."""
    previous = os.getcwd()
    os.chdir(BACKEND_DIR)
    try:
        yield
    finally:
        os.chdir(previous)


@pytest.fixture(autouse=True)
def _ensure_db_schema():
    """CI (.github/workflows/ci-tests.yml) runs `pytest` straight from the
    repo root with no `alembic upgrade head` step -- fine for every other
    test file, since none of them writes to the DB, but this file's POST
    /start does (ensure_run/write_telemetry/write_health_score). Creating
    any missing tables from the ORM metadata directly is idempotent against
    a real, already-migrated dev.db (only fills in what's missing) and
    self-sufficient against CI's unmigrated one -- avoids depending on a CI
    workflow change for a test file to pass."""
    from app.db import models  # noqa: F401 -- import registers every table on Base.metadata
    from app.db.base import Base, engine

    Base.metadata.create_all(bind=engine)


# TestClient MUST be used as a context manager here (`with TestClient(app) as
# client:`), not a bare `TestClient(app)` per-call -- a bare instance spins up
# a fresh anyio portal/event-loop cycle per request, so the background
# asyncio.create_task() a prior POST /start scheduled never gets a chance to
# resume between calls (confirmed directly: frames_written stayed at 0
# forever under a bare TestClient, and progressed normally once wrapped in
# `with`). This is a TestClient-only artifact -- verified working correctly
# against a real uvicorn server with a raw websockets client.


def test_stream_delivers_ticks_with_matching_frame_and_health_t() -> None:
    """The whole point of publishing after write_health_score (not before,
    as it was originally): every tick's frame.t and health.t must agree, so
    a client never sees engine-health/sensor-fault state for a different
    instant than the telemetry it's rendering alongside."""
    run_id = RUN_IDS[0]
    with TestClient(app) as client:
        start = client.post(f"/api/v1/replay/{run_id}/start", json={"speed": 50.0})
        assert start.status_code == 200
        session_id = start.json()["session_id"]

        ticks_seen = 0
        with client.websocket_connect(f"/api/v1/replay/{session_id}/stream") as ws:
            for _ in range(5):
                message = ws.receive_json()
                if message["type"] == "session_ended":
                    break
                assert message["type"] == "tick"
                assert message["frame"]["t"] is not None
                if message["health"] is not None:
                    assert message["health"]["t"] == message["frame"]["t"]
                ticks_seen += 1

    assert ticks_seen > 0


def test_stream_sends_session_ended_for_unknown_session() -> None:
    with TestClient(app) as client, client.websocket_connect("/api/v1/replay/not-a-real-session/stream") as ws:
        message = ws.receive_json()
    assert message["type"] == "session_ended"
    assert message["status"] == "unknown"
