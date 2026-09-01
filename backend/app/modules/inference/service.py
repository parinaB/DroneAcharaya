"""Inference: get_health_score() is the one function that decides between
a real trained model and the ground-truth stand-in. model_loader.py stays
NotImplementedError-safe on purpose (Phase 7, not now) — nothing here
waits on ML training finishing.
"""

from __future__ import annotations

from app.core.model_loader import load_model

# fault_class -> (direction, groundtruth columns), per
# contract/health-parameter-registry.md's two conventions:
#   "health": 1.0 = healthy -> 0.0 = failed (use the worst/minimum column)
#   "deg":    0.0 = healthy -> 1.0 = failed (invert the worst/maximum column)
HEALTH_COLUMNS: dict[str, tuple[str, list[str]]] = {
    "injector_degradation": (
        "health",
        ["injector_health_c1", "injector_health_c2", "injector_health_c3", "injector_health_c4"],
    ),
    "cooling_degradation": ("health", ["cooling_health"]),
    "oil_pump_degradation": ("health", ["oil_pump_health"]),
    "bearing_wear": ("health", ["bearing_health"]),
    "mechanical_vibration": ("health", ["bearing_health"]),
    "fuel_starvation": ("health", ["fuel_delivery_health"]),
    "alternator_degradation": ("health", ["alternator_health"]),
    "turbo_degradation": ("deg", ["turbo_efficiency_deg"]),
    "injection_timing_drift": ("deg", ["injection_timing_deg"]),
    "combustion_instability": ("deg", ["combustion_stability"]),
    "misfire": ("deg", ["misfire_rate_c1", "misfire_rate_c2", "misfire_rate_c3", "misfire_rate_c4"]),
}


def ground_truth_health_score(fault_class: str, groundtruth_row: dict) -> tuple[float, float]:
    """Returns (health_index 0-100, fault_probability 0-1) from a single
    groundtruth row. Never fabricates a score for an unrecognized
    fault_class — returns full health instead, since making something up
    would be worse than admitting the mapping doesn't cover it yet."""
    if fault_class in (None, "healthy", "none"):
        return 100.0, 0.0
    spec = HEALTH_COLUMNS.get(fault_class)
    if spec is None:
        return 100.0, 0.0
    direction, columns = spec
    values = [groundtruth_row[c] for c in columns if c in groundtruth_row]
    if not values:
        return 100.0, 0.0
    fraction = min(values) if direction == "health" else 1.0 - max(values)
    fraction = max(0.0, min(1.0, fraction))
    return fraction * 100.0, round(1.0 - fraction, 4)


def get_health_score(fault_class: str, groundtruth_row: dict | None) -> dict:
    """Returns the fields HealthScoreOut/HealthScore need, minus run_id/t
    (the caller already has those). Tries a real model first; falls
    through to the ground-truth stand-in since none are trained yet."""
    try:
        load_model("digital_twin")  # always raises today -- Phase 7 not started
    except NotImplementedError:
        pass
    else:
        raise AssertionError("model_loader succeeded but Phase 7 inference wiring doesn't exist yet")

    if groundtruth_row is None:
        # No ground truth available (e.g. a live/non-fixture source) and no
        # model either -- honestly report "unknown", don't fabricate.
        return {
            "fault_type": "unknown",
            "fault_probability": 0.0,
            "health_index": 100.0,
            "rul_estimate_hours": None,
            "rul_lower": None,
            "rul_upper": None,
            "source": "ground_truth",
            "model_version": None,
        }

    health_index, fault_probability = ground_truth_health_score(fault_class, groundtruth_row)
    return {
        "fault_type": fault_class or "none",
        "fault_probability": fault_probability,
        "health_index": health_index,
        # RUL formula isn't formalized anywhere upstream yet (data/README.md
        # says so explicitly) -- left None rather than invented here.
        "rul_estimate_hours": None,
        "rul_lower": None,
        "rul_upper": None,
        "source": "ground_truth",
        "model_version": None,
    }
