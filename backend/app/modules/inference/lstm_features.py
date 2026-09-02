"""Builds EngineMultiHeadLSTM's (seq_len, 49) input tensor from a rolling
window of EngineFrame instances. Feature order and preprocessing steps
mirror ml/training/lstm_rul/README.md's "Training data" section exactly --
SENSOR_COLUMNS (scaled) + NAN_PRONE_SENSOR_COLUMNS missing-flags +
one-hot engine_state. Any drift from that order silently produces wrong
predictions, since the model has no way to detect a shuffled input.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import torch

from app.bridge.frame import EngineFrame
from app.core.model_loader import LstmRulBundle


def build_lstm_input(bundle: LstmRulBundle, window: list[EngineFrame]) -> torch.Tensor:
    """Returns a (1, seq_len, 49) float32 tensor ready for
    EngineMultiHeadLSTM.forward(). `window` must have exactly seq_len frames,
    oldest first -- the caller (BridgeService) owns windowing/truncation.
    """
    raw_df = pd.DataFrame(
        [{col: getattr(frame, col) for col in bundle.sensor_columns} for frame in window],
        columns=bundle.sensor_columns,
    )

    missing_flags = np.zeros((len(window), len(bundle.nan_prone_columns)), dtype=np.float32)
    for flag_idx, col in enumerate(bundle.nan_prone_columns):
        missing_flags[:, flag_idx] = raw_df[col].isna().to_numpy().astype(np.float32)

    scaled = bundle.scaler.transform(raw_df)
    scaled = np.nan_to_num(scaled, nan=0.0)  # NaN-prone columns: 0.0 == training mean, post-scaling

    engine_state_df = pd.DataFrame({"engine_state": [frame.engine_state for frame in window]})
    engine_state_onehot = bundle.engine_state_encoder.transform(engine_state_df).astype(np.float32)

    features = np.concatenate([scaled.astype(np.float32), missing_flags, engine_state_onehot], axis=1)
    return torch.from_numpy(features).unsqueeze(0)
