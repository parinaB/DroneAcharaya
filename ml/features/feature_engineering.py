"""Feature extraction shared by the autoencoder, classifier and RUL models.

Signatures only — implementations land once the simulation exports real runs.
Every function is pure and operates on a single run's telemetry, so the same
code path serves offline training and online inference.
"""

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Sequence

import joblib
import numpy as np
import pandas as pd

_DEFAULT_DIGITAL_TWIN_DIR = Path(__file__).resolve().parents[1] / "artifacts" / "digital_twin" / "v1"

# Must match ml/features/fit_digital_twin.py's CONDITION_FEATURES and
# GATED_OUT_STATES exactly -- these are the twin's operating-condition inputs
# and the transient engine_states its expected-value models were never fit on.
_CONDITION_FEATURES = ["rpm", "throttle", "altitude", "ambient_temperature", "air_density"]
_GATED_OUT_STATES = {"STARTING", "SHUTDOWN", "THROTTLE_TRANSIENT"}


@lru_cache(maxsize=4)
def _load_digital_twin_models(artifacts_dir: str) -> dict[str, Any]:
    path = Path(artifacts_dir)
    metadata = json.loads((path / "metadata.json").read_text())
    return {target: joblib.load(path / f"{target}.joblib") for target in metadata["target_channels"]}


def extract_fft_bands(
    signal: np.ndarray,
    sample_rate: float,
    bands: Sequence[tuple[float, float]],
) -> dict[str, float]:
    """Compute spectral energy within named frequency bands of a signal.

    Intended mainly for the vibration channel, where bearing wear and ignition
    misfire show up as energy shifting between orders of the rotational
    frequency rather than as a change in broadband RMS.

    Args:
        signal: 1-D time-domain samples for one window (e.g. vibration).
        sample_rate: Sampling frequency of ``signal``, Hz.
        bands: ``(low_hz, high_hz)`` pairs defining each band, inclusive of low
            and exclusive of high.

    Returns:
        Mapping of ``"fft_<low>_<high>hz"`` to that band's energy, plus derived
        ratios between adjacent bands.

    Raises:
        NotImplementedError: Not implemented yet.
    """
    raise NotImplementedError


def rolling_stats(
    frame: pd.DataFrame,
    columns: Sequence[str],
    windows: Sequence[int],
) -> pd.DataFrame:
    """Append rolling summary statistics for the given columns.

    Captures slow drift and rising variance — the signature of gradual
    degradation that instantaneous values miss.

    Args:
        frame: Telemetry for a single ``run_id``, time-ordered.
        columns: Sensor columns to summarise.
        windows: Window lengths in samples (e.g. ``(30, 120, 600)``).

    Returns:
        A copy of ``frame`` with added ``<column>_<stat>_<window>`` columns for
        mean, std, min, max and slope. Rows before a window fills are NaN and
        are the caller's responsibility to drop.

    Raises:
        NotImplementedError: Not implemented yet.
    """
    raise NotImplementedError


def physics_residuals(
    frame: pd.DataFrame,
    artifacts_dir: str | Path = _DEFAULT_DIGITAL_TWIN_DIR,
) -> pd.DataFrame:
    """Compute residuals between measured telemetry and physics-based expectations.

    This is where the digital twin earns its keep: instead of asking the model to
    learn the engine's nominal map from data alone, we feed it the *deviation*
    from the expected relationship (e.g. expected fuel flow for the current RPM
    and load, expected CHT for the current EGT and airspeed). Residuals are far
    more separable across fault classes than raw channels, and they stay
    meaningful under mission profiles the model has not seen.

    The "expected" side is data-driven, not a re-run of the Simulink model: one
    regressor per target channel, fit on operating condition (rpm, throttle,
    altitude, ambient_temperature, air_density) using only fully-healthy
    missions, by ``fit_digital_twin.py``. Loading here is cached, so this same
    code path is cheap enough for both offline feature generation and live
    inference.

    State-machine-gated per build_plan.md's Step 7: rows in a genuine
    transient (``STARTING``, ``SHUTDOWN``, ``THROTTLE_TRANSIENT``) get NaN
    residuals rather than a number computed against a model that was never fit
    on that regime -- a transient isn't a fault, and forcing a residual there
    would just teach downstream models to associate normal startup/shutdown
    with a fault signature.

    Args:
        frame: Telemetry for a single ``run_id``, time-ordered, containing the
            raw sensor columns from ``data/schema.md`` (must include
            ``engine_state`` and the condition columns above).
        artifacts_dir: Directory holding the fitted models + ``metadata.json``
            (see ``ml/artifacts/README.md``'s layout). Defaults to
            ``ml/artifacts/digital_twin/v1/``.

    Returns:
        A DataFrame of ``<quantity>_residual`` columns aligned to ``frame``'s
        index — measured minus expected, in each quantity's native units, NaN
        during gated-out transient states or wherever the measured value
        itself is NaN.
    """
    models = _load_digital_twin_models(str(artifacts_dir))
    gated = frame["engine_state"].isin(_GATED_OUT_STATES)
    condition = frame[_CONDITION_FEATURES]

    residuals = {}
    for target, model in models.items():
        if target not in frame.columns:
            continue
        expected = pd.Series(model.predict(condition), index=frame.index)
        residual = frame[target] - expected
        residual[gated] = np.nan
        residuals[f"{target}_residual"] = residual

    return pd.DataFrame(residuals, index=frame.index)
