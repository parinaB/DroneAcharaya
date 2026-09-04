"""MaintenanceRuleEngine: translates model health/RUL/sensor-fault output
into maintenance recommendations, per contract/maintenance-rules.yaml.

All thresholds and action/consequence text live in the YAML, not here --
see that file's own header for where the numbers and wording come from
(failure-mode-matrix.csv verbatim, FAILURE_THRESHOLDS' 1.0->0.0 convention).
This module is pure lookup + sort; editing maintenance behavior should never
require touching this file, only the YAML.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

_URGENCY_ORDER: dict[str, int] = {"IMMEDIATE": 0, "URGENT": 1, "SCHEDULED": 2, "ROUTINE": 3}

# Known health-parameter and sensor-fault-class vocabularies this engine
# must cover -- see contract/health-parameter-registry.md and
# contract/ground-truth-schema.yaml's sensor_fault_activity enum. Loading
# fails loudly if maintenance-rules.yaml is missing a rule for any of these,
# rather than silently skipping recommendations for an uncovered parameter.
KNOWN_HEALTH_PARAMETERS: frozenset[str] = frozenset(
    {
        "injector_health_c1",
        "injector_health_c2",
        "injector_health_c3",
        "injector_health_c4",
        "cooling_health",
        "oil_pump_health",
        "bearing_health",
        "fuel_delivery_health",
        "alternator_health",
        "turbo_efficiency_deg",
        "injection_timing_deg",
        "combustion_stability",
        "misfire_rate_c1",
        "misfire_rate_c2",
        "misfire_rate_c3",
        "misfire_rate_c4",
    }
)

# NONE is deliberately excluded -- it means "no sensor fault," never a
# recommendation-worthy prediction, so the engine must not require a rule
# for it.
KNOWN_SENSOR_FAULT_CLASSES: frozenset[str] = frozenset({"BIAS", "DRIFT", "NOISE", "STUCK", "DROPOUT"})


class MaintenanceRuleEngineError(Exception):
    """Raised when maintenance-rules.yaml is malformed or incomplete."""


class MaintenanceRuleEngine:
    def __init__(self, rules_path: str | Path) -> None:
        path = Path(rules_path)
        with path.open(encoding="utf-8") as f:
            raw = yaml.safe_load(f)

        rules_list = raw.get("rules") if isinstance(raw, dict) else None
        if not isinstance(rules_list, list):
            raise MaintenanceRuleEngineError(f"{path}: missing or malformed top-level 'rules' list")

        sensor_rules = raw.get("sensor_fault_rules") if isinstance(raw, dict) else None
        if not isinstance(sensor_rules, dict):
            raise MaintenanceRuleEngineError(f"{path}: missing or malformed top-level 'sensor_fault_rules' map")

        self._rules: dict[str, dict[str, Any]] = {}
        for entry in rules_list:
            param = entry.get("health_parameter")
            if not param:
                raise MaintenanceRuleEngineError(f"{path}: a rule entry is missing 'health_parameter'")
            for field in ("component", "tiers", "consequence", "severity_rank"):
                if field not in entry:
                    raise MaintenanceRuleEngineError(f"{path}: rule '{param}' is missing '{field}'")
            for tier in ("watch", "warning", "critical"):
                tier_spec = entry["tiers"].get(tier)
                if not tier_spec or "min" not in tier_spec or "max" not in tier_spec or "action" not in tier_spec:
                    raise MaintenanceRuleEngineError(f"{path}: rule '{param}' tier '{tier}' is incomplete")
            self._rules[param] = entry

        missing_params = KNOWN_HEALTH_PARAMETERS - self._rules.keys()
        if missing_params:
            raise MaintenanceRuleEngineError(
                f"{path}: no maintenance rule for health parameter(s) {sorted(missing_params)}"
            )

        self._sensor_rules: dict[str, dict[str, Any]] = sensor_rules
        missing_sensor_classes = KNOWN_SENSOR_FAULT_CLASSES - sensor_rules.keys()
        if missing_sensor_classes:
            raise MaintenanceRuleEngineError(
                f"{path}: no sensor_fault_rules entry for class(es) {sorted(missing_sensor_classes)}"
            )
        for fault_class, spec in sensor_rules.items():
            if not spec or "action" not in spec:
                raise MaintenanceRuleEngineError(f"{path}: sensor_fault_rules['{fault_class}'] is missing 'action'")

    def _tier_for_value(self, param: str, value: float) -> str | None:
        """Returns the tier name value falls into, or None if healthy (above
        every tier's max). watch.min == watch.max means "no watch band" (see
        maintenance-rules.yaml's header for the four rules this applies to)
        -- such a watch tier can never match."""
        tiers = self._rules[param]["tiers"]
        for tier in ("critical", "warning", "watch"):
            spec = tiers[tier]
            lo, hi = spec["min"], spec["max"]
            if lo == hi:
                continue
            if lo <= value < hi:
                return tier
        return None

    def _compute_urgency(self, tier: str, rul_hours: float | None) -> str:
        if tier == "critical":
            return "IMMEDIATE"
        if tier == "warning":
            return "URGENT" if rul_hours is not None and rul_hours < 24 else "SCHEDULED"
        return "ROUTINE"  # tier == "watch"

    def evaluate_health(self, health_values: dict[str, float], rul_hours: float | None) -> list[dict[str, Any]]:
        """One recommendation per health parameter currently in watch/
        warning/critical; healthy parameters (tier is None) are skipped
        entirely, never emitted as a "nominal" recommendation."""
        recommendations: list[dict[str, Any]] = []
        for param, value in health_values.items():
            if param not in self._rules:
                raise MaintenanceRuleEngineError(f"no maintenance rule for health parameter {param!r}")
            tier = self._tier_for_value(param, value)
            if tier is None:
                continue
            rule = self._rules[param]
            recommendations.append(
                {
                    "component": rule["component"],
                    "health_parameter": param,
                    "value": value,
                    "tier": tier,
                    "urgency": self._compute_urgency(tier, rul_hours),
                    "action": rule["tiers"][tier]["action"],
                    "consequence": rule["consequence"],
                    "severity_rank": rule["severity_rank"],
                }
            )
        return self._sort_engine_recommendations(recommendations)

    def evaluate_sensor_faults(self, sensor_fault_preds: dict[str, str]) -> list[dict[str, Any]]:
        """One recommendation per channel whose prediction isn't NONE/None."""
        recommendations: list[dict[str, Any]] = []
        for channel, fault_type in sensor_fault_preds.items():
            if fault_type is None or fault_type == "NONE":
                continue
            if fault_type not in self._sensor_rules:
                raise MaintenanceRuleEngineError(f"no sensor_fault_rules entry for class {fault_type!r}")
            recommendations.append(
                {
                    "channel": channel,
                    "fault_type": fault_type,
                    "action": self._sensor_rules[fault_type]["action"],
                }
            )
        return recommendations

    def evaluate(
        self,
        health_values: dict[str, float],
        rul_hours: float | None,
        sensor_fault_preds: dict[str, str],
    ) -> dict[str, list[dict[str, Any]]]:
        return {
            "engine_recommendations": self.evaluate_health(health_values, rul_hours),
            "sensor_recommendations": self.evaluate_sensor_faults(sensor_fault_preds),
        }

    @staticmethod
    def _sort_engine_recommendations(recommendations: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return sorted(
            recommendations,
            key=lambda r: (_URGENCY_ORDER[r["urgency"]], r["severity_rank"]),
        )
