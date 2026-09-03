"""EngineMultiHeadLSTM — importable definition matching lstm_training.ipynb's
architecture exactly (layer names and shapes must match ml/artifacts/lstm_rul/v1's
checkpoint state_dict keys). This is the only Python copy; the notebook is
exploratory only (ml/CLAUDE.md) and cannot be imported from directly.
"""

from __future__ import annotations

import torch
from torch import nn


class EngineMultiHeadLSTM(nn.Module):
    def __init__(
        self,
        input_size: int,
        num_health_params: int,
        num_sensor_channels: int,
        num_sensor_fault_classes: int = 6,
        hidden_size: int = 256,
        num_layers: int = 3,
        dropout: float = 0.5,
        bidirectional: bool = False,
    ) -> None:
        super().__init__()
        self.num_sensor_channels = num_sensor_channels
        self.num_sensor_fault_classes = num_sensor_fault_classes
        direction_factor = 2 if bidirectional else 1

        self.lstm = nn.LSTM(
            input_size=input_size,
            hidden_size=hidden_size,
            num_layers=num_layers,
            batch_first=True,
            dropout=dropout if num_layers > 1 else 0.0,
            bidirectional=bidirectional,
        )

        self.attn_fc = nn.Linear(hidden_size * direction_factor, 1)

        shared_dim = hidden_size * direction_factor
        self.shared_fc = nn.Sequential(
            nn.Linear(shared_dim, shared_dim // 2),
            nn.ReLU(),
            nn.Dropout(dropout),
        )

        self.health_head = nn.Sequential(
            nn.Linear(shared_dim // 2, 64),
            nn.ReLU(),
            nn.Linear(64, num_health_params),
            nn.Sigmoid(),
        )

        self.rul_head = nn.Sequential(
            nn.Linear(shared_dim // 2, 32),
            nn.ReLU(),
            nn.Linear(32, 1),
        )

        self.sensor_fault_head = nn.Sequential(
            nn.Linear(shared_dim // 2, 128),
            nn.ReLU(),
            nn.Linear(128, num_sensor_channels * num_sensor_fault_classes),
        )

    def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor]:
        lstm_out, _ = self.lstm(x)

        attn_scores = self.attn_fc(lstm_out)
        attn_weights = torch.softmax(attn_scores, dim=1)
        context = torch.sum(attn_weights * lstm_out, dim=1)

        shared = self.shared_fc(context)

        health_pred = self.health_head(shared)
        rul_pred = nn.functional.softplus(self.rul_head(shared)).squeeze(-1)
        sensor_fault_logits = self.sensor_fault_head(shared)
        sensor_fault_logits = sensor_fault_logits.view(-1, self.num_sensor_channels, self.num_sensor_fault_classes)

        return health_pred, rul_pred, sensor_fault_logits, attn_weights
