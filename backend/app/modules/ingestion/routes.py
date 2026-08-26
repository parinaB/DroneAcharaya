"""Ingestion: receives and validates telemetry streams / uploaded run files."""

from fastapi import APIRouter

router = APIRouter(prefix="/ingestion", tags=["ingestion"])


@router.get("/status")
async def ingestion_status() -> dict[str, str]:
    """Stub: report ingestion pipeline state (last packet, buffer depth, active run_id)."""
    return {"module": "ingestion", "status": "stub"}
