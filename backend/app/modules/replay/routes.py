"""Replay: serves recorded simulation runs back for time-scrubbed what-if analysis."""

from fastapi import APIRouter

router = APIRouter(prefix="/replay", tags=["replay"])


@router.get("/status")
async def replay_status() -> dict[str, str]:
    """Stub: list available recorded runs and current playback cursor."""
    return {"module": "replay", "status": "stub"}
