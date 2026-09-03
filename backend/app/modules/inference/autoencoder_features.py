"""Builds the autoencoder's row-level feature vector from a single
EngineFrame: physics_residuals() output (measured - digital-twin-expected,
per channel) + operating condition + one-hot engine_state, standardised with
the bundle's fitted scaler. Row-level, not windowed -- see
ml/training/autoencoder/README.md's "Row-level (flat)" note; unlike
lstm_rul/xgboost_classifier, no rolling history is needed.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from app.bridge.frame import EngineFrame
from app.core.model_loader import AutoencoderBundle


def build_autoencoder_features(bundle: AutoencoderBundle, frame: EngineFrame) -> np.ndarray | None:
    """Returns a (1, len(feature_columns)) float32 array in the bundle's
    trained feature order, or None if this frame's engine_state is gated out
    (STARTING/SHUTDOWN/THROTTLE_TRANSIENT -- physics_residuals() itself
    would return NaN residuals here, same as the digital twin's own fit
    never saw these states) or any needed channel is NaN (e.g. vibration
    columns outside the sidecar's active states).
    """
    from app.core.model_loader import AE_GATED_STATES
    from ml.features.feature_engineering import physics_residuals

    if frame.engine_state in AE_GATED_STATES:
        return None

    # residual_columns are "<channel>_residual" -- physics_residuals() wants
    # the raw channel name.
    raw_channels = [col.removesuffix("_residual") for col in bundle.residual_columns]
    row = {col: getattr(frame, col) for col in raw_channels}
    row.update({col: getattr(frame, col) for col in bundle.condition_features})
    row["engine_state"] = frame.engine_state
    row_df = pd.DataFrame([row])

    residuals = physics_residuals(row_df, artifacts_dir=bundle.digital_twin_dir)
    if residuals[bundle.residual_columns].isna().any(axis=None):
        return None

    condition = row_df[bundle.condition_features].astype(np.float32)
    engine_state_onehot = pd.DataFrame(
        {f"engine_state_{c}": [1.0 if frame.engine_state == c else 0.0] for c in bundle.engine_state_categories},
        dtype=np.float32,
    )

    scale_frame = pd.concat([residuals[bundle.residual_columns], condition], axis=1)[bundle.scale_columns]
    mean = np.array(bundle.scaler_mean)
    std = np.array(bundle.scaler_std)
    scaled = (scale_frame.to_numpy(dtype=np.float32) - mean) / std

    full = np.concatenate([scaled, engine_state_onehot.to_numpy(dtype=np.float32)], axis=1)
    return full.astype(np.float32)
