"""Unit tests for MaintenanceRuleEngine against the real
contract/maintenance-rules.yaml -- not a mocked/fixture YAML, so a rule
edit that breaks coverage of a known health parameter or sensor-fault class
fails these tests immediately."""

from __future__ import annotations

from pathlib import Path

import pytest
from app.maintenance.rule_engine import KNOWN_HEALTH_PARAMETERS, MaintenanceRuleEngine

RULES_PATH = Path(__file__).resolve().parents[2] / "contract" / "maintenance-rules.yaml"


@pytest.fixture
def engine() -> MaintenanceRuleEngine:
    return MaintenanceRuleEngine(RULES_PATH)


def _fully_healthy() -> dict[str, float]:
    return dict.fromkeys(KNOWN_HEALTH_PARAMETERS, 1.0)


def test_fully_healthy_produces_no_recommendations(engine: MaintenanceRuleEngine) -> None:
    report = engine.evaluate(_fully_healthy(), rul_hours=500.0, sensor_fault_preds={})
    assert report["engine_recommendations"] == []
    assert report["sensor_recommendations"] == []


def test_single_critical_health_parameter_is_immediate(engine: MaintenanceRuleEngine) -> None:
    values = _fully_healthy()
    values["bearing_health"] = 0.1  # well under bearing_health's 0.5 failure criterion
    report = engine.evaluate(values, rul_hours=200.0, sensor_fault_preds={})
    assert len(report["engine_recommendations"]) == 1
    rec = report["engine_recommendations"][0]
    assert rec["health_parameter"] == "bearing_health"
    assert rec["tier"] == "critical"
    assert rec["urgency"] == "IMMEDIATE"


def test_sensor_fault_drift_produces_correct_action(engine: MaintenanceRuleEngine) -> None:
    report = engine.evaluate(_fully_healthy(), rul_hours=None, sensor_fault_preds={"cht_c3": "DRIFT"})
    assert len(report["sensor_recommendations"]) == 1
    rec = report["sensor_recommendations"][0]
    assert rec["channel"] == "cht_c3"
    assert rec["fault_type"] == "DRIFT"
    assert rec["action"] == "Recalibrate sensor; monitor drift rate"


def test_confusable_pair_does_not_cross_contaminate(engine: MaintenanceRuleEngine) -> None:
    """Real injector fault on cylinder 1 + sensor drift on an unrelated
    channel (cht_c3) -- both recommendations must appear, and the
    sensor-drifted channel's underlying health parameter (injector_health_c3,
    the channel cht_c3 would map to on the engine side) must NOT get an
    engine_recommendation just because a sensor fault was reported on a
    same-cylinder-numbered channel."""
    values = _fully_healthy()
    values["injector_health_c1"] = 0.4  # real fault, below 0.6 failure criterion
    report = engine.evaluate(
        values,
        rul_hours=48.0,
        sensor_fault_preds={"cht_c3": "DRIFT", "bearing_vibration": "NONE"},
    )

    engine_params = {r["health_parameter"] for r in report["engine_recommendations"]}
    assert engine_params == {"injector_health_c1"}
    assert "injector_health_c3" not in engine_params

    sensor_channels = {r["channel"] for r in report["sensor_recommendations"]}
    assert sensor_channels == {"cht_c3"}


def test_multiple_critical_faults_sorted_by_severity_rank(engine: MaintenanceRuleEngine) -> None:
    values = _fully_healthy()
    values["alternator_health"] = 0.1  # severity_rank 7
    values["bearing_health"] = 0.1  # severity_rank 1 -- most severe
    values["cooling_health"] = 0.1  # severity_rank 3
    report = engine.evaluate(values, rul_hours=1.0, sensor_fault_preds={})

    ranks = [r["severity_rank"] for r in report["engine_recommendations"]]
    assert ranks == sorted(ranks)
    assert report["engine_recommendations"][0]["health_parameter"] == "bearing_health"


def test_warning_tier_urgency_depends_on_rul(engine: MaintenanceRuleEngine) -> None:
    values = _fully_healthy()
    values["cooling_health"] = 0.55  # between failure_criterion 0.5 and watch ceiling 0.85 -> warning
    urgent = engine.evaluate(values, rul_hours=12.0, sensor_fault_preds={})["engine_recommendations"][0]
    scheduled = engine.evaluate(values, rul_hours=200.0, sensor_fault_preds={})["engine_recommendations"][0]
    assert urgent["urgency"] == "URGENT"
    assert scheduled["urgency"] == "SCHEDULED"
