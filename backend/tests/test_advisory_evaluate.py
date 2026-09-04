"""Route-level tests for POST /api/v1/advisory/evaluate -- the arbitrary-
snapshot advisory endpoint used to aggregate maintenance recommendations
across a whole run rather than just the latest HealthScore row."""

from __future__ import annotations

from app.main import app
from fastapi.testclient import TestClient

client = TestClient(app)

ENDPOINT = "/api/v1/advisory/evaluate"


def test_healthy_snapshot_returns_empty_lists() -> None:
    response = client.post(ENDPOINT, json={"health_parameters": {"bearing_health": 1.0}})
    assert response.status_code == 200
    body = response.json()
    assert body["engine_recommendations"] == []
    assert body["sensor_recommendations"] == []


def test_worst_case_snapshot_surfaces_two_distinct_faults() -> None:
    """The scenario this endpoint exists for: two different health
    parameters were each critical at DIFFERENT points during a run (never
    simultaneously in any single HealthScore row) -- the client aggregates
    them into one worst-per-parameter snapshot, and both must show up."""
    response = client.post(
        ENDPOINT,
        json={
            "health_parameters": {"bearing_health": 0.2, "cooling_health": 0.3},
            "rul_hours": 5.0,
            "sensor_fault_preds": {"cht_c3": "DRIFT"},
        },
    )
    assert response.status_code == 200
    body = response.json()
    params = {r["health_parameter"] for r in body["engine_recommendations"]}
    assert params == {"bearing_health", "cooling_health"}
    assert all(r["urgency"] == "IMMEDIATE" for r in body["engine_recommendations"])
    channels = {r["channel"] for r in body["sensor_recommendations"]}
    assert channels == {"cht_c3"}


def test_unknown_health_parameter_returns_422() -> None:
    response = client.post(ENDPOINT, json={"health_parameters": {"not_a_real_parameter": 0.1}})
    assert response.status_code == 422
