"""CAN framing — explicitly stubbed, not built.

Irrelevant until a real CAN-bus ECU is the frame source (see sources.py's
FrameSource protocol for where that would plug in). Documented as an
extension point rather than silently absent, same pattern as
app/core/model_loader.py.
"""

from __future__ import annotations

from typing import Any


def decode_can_frame(raw: bytes) -> Any:
    """Decode a raw CAN frame into an EngineFrame-shaped value.

    Raises:
        NotImplementedError: Always — no CAN-bus source exists yet.
    """
    raise NotImplementedError("CAN framing is not implemented yet — no live CAN-bus ECU source exists.")
