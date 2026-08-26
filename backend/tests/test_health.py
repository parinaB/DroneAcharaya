"""Smoke test for the health-check route."""

from app.main import app
from fastapi.testclient import TestClient

client = TestClient(app)


def test_health_returns_200() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
