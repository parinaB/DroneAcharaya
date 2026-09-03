"""Builds xgboost_classifier's (1, 56) raw feature vector from a rolling
buffer of EngineFrame instances. Feature order and rolling-feature formulas
mirror ml/training/xgboost_classifier/xgboost_training.ipynb's cells 8/11/12
exactly (add_rolling_features, XGB_FEATURE_COLUMNS) -- any drift from that
order or formula silently produces wrong predictions.

Unlike lstm_rul, this model is row-level: only the LAST row of the buffer's
computed features is used per prediction, but the rolling/stuck-run
calculations need history to compute correctly (a 10s trailing window, plus
however far back a stuck-value streak goes) -- see build_xgboost_features's
docstring for the buffer-length tradeoff this makes.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from app.bridge.frame import EngineFrame
from app.core.model_loader import (
    XGB_ENGINE_STATE_CATEGORIES,
    XGB_FEATURE_COLUMNS,
    XGB_MISSING_FLAG_COLUMNS,
    XGB_ROLLING_FAULT_PRONE_COLUMNS,
    XGB_ROLLING_WINDOW,
    XGB_SENSOR_COLUMNS,
)


def _add_rolling_features(df: pd.DataFrame, cols: list[str], window: int) -> pd.DataFrame:
    """Same logic as the notebook's add_rolling_features(), applied to a
    single buffered run (already time-ordered, no run_id grouping needed
    since BridgeService's buffer never spans more than one session)."""
    for col in cols:
        roll = df[col].rolling(window=window, min_periods=1)
        roll_mean = roll.mean()
        roll_std = roll.std()

        df[f"{col}_roll_mean"] = roll_mean
        df[f"{col}_roll_std"] = roll_std.fillna(0.0)
        df[f"{col}_dev_from_roll_mean"] = df[col] - roll_mean
        df[f"{col}_diff"] = df[col].diff().fillna(0.0)

        is_same_as_prev = df[col].diff().fillna(1.0) == 0.0
        stuck_run_id = (~is_same_as_prev).cumsum()
        df[f"{col}_stuck_run_length"] = df.groupby(stuck_run_id).cumcount() + 1

    return df


def build_xgboost_features(window: list[EngineFrame]) -> np.ndarray:
    """Returns a (1, 56) float32 array in XGB_FEATURE_COLUMNS order, raw
    (unscaled) -- see model_loader.py's module docstring for why. `window`
    is the buffered frames up to and including the current one, oldest
    first; only the last row's features are returned, but the buffer must
    be long enough to make its rolling stats meaningful (BridgeService uses
    the same LSTM_SEQ_LEN=60-frame buffer for both models, well over the
    10s rolling window this needs).
    """
    raw_df = pd.DataFrame([{col: getattr(frame, col) for col in XGB_SENSOR_COLUMNS} for frame in window])

    nan_prone_columns = [*XGB_ROLLING_FAULT_PRONE_COLUMNS, "vibration_rms_x", "vibration_order_1x"]
    missing_flags = pd.DataFrame({f"{col}_missing": raw_df[col].isna().astype(np.float32) for col in nan_prone_columns})
    # Only the 3 flags the model was trained on -- see XGB_MISSING_FLAG_COLUMNS.
    missing_flags = missing_flags[XGB_MISSING_FLAG_COLUMNS]

    rolled_df = _add_rolling_features(raw_df.copy(), XGB_ROLLING_FAULT_PRONE_COLUMNS, XGB_ROLLING_WINDOW)

    engine_states = [frame.engine_state for frame in window]
    engine_state_onehot = pd.DataFrame(
        {
            f"engine_state_{cat}": [1.0 if s == cat else 0.0 for s in engine_states]
            for cat in XGB_ENGINE_STATE_CATEGORIES
        },
        dtype=np.float32,
    )

    combined = pd.concat(
        [
            raw_df.reset_index(drop=True),
            missing_flags.reset_index(drop=True),
            rolled_df[[c for c in rolled_df.columns if c not in raw_df.columns]].reset_index(drop=True),
            engine_state_onehot.reset_index(drop=True),
        ],
        axis=1,
    )

    last_row = combined.iloc[[-1]][XGB_FEATURE_COLUMNS]
    last_row = last_row.fillna(0.0)  # NaN-prone sensors: 0.0, same convention as lstm_rul's missing-flag fill
    return last_row.to_numpy(dtype=np.float32)
