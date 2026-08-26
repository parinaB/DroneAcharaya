"""Feature extraction shared by the autoencoder, classifier and RUL models.

Signatures only — implementations land once the simulation exports real runs.
Every function is pure and operates on a single run's telemetry, so the same
code path serves offline training and online inference.
"""

from typing import Sequence

import numpy as np
import pandas as pd


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


def physics_residuals(frame: pd.DataFrame) -> pd.DataFrame:
    """Compute residuals between measured telemetry and physics-based expectations.

    This is where the digital twin earns its keep: instead of asking the model to
    learn the engine's nominal map from data alone, we feed it the *deviation*
    from the expected relationship (e.g. expected fuel flow for the current RPM
    and load, expected CHT for the current EGT and airspeed). Residuals are far
    more separable across fault classes than raw channels, and they stay
    meaningful under mission profiles the model has not seen.

    Args:
        frame: Telemetry for a single ``run_id``, time-ordered, containing the
            raw sensor columns from ``data/schema.md``.

    Returns:
        A DataFrame of ``<quantity>_residual`` columns aligned to ``frame``'s
        index — measured minus expected, in each quantity's native units.

    Raises:
        NotImplementedError: Not implemented yet.
    """
    raise NotImplementedError
