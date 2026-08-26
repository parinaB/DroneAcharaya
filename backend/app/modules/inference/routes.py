"""Inference: runs the trained anomaly, fault-classification and RUL models on telemetry."""

from fastapi import APIRouter

router = APIRouter(prefix="/inference", tags=["inference"])


@router.get("/status")
async def inference_status() -> dict[str, str]:
    """Stub: report which model artifacts are loaded and their versions."""
    return {"module": "inference", "status": "stub"}
