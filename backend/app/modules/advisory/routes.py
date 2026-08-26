"""Advisory: turns model outputs into ranked maintenance actions and explanations."""

from fastapi import APIRouter

router = APIRouter(prefix="/advisory", tags=["advisory"])


@router.get("/status")
async def advisory_status() -> dict[str, str]:
    """Stub: report the advisory rule set / SHAP explainer readiness."""
    return {"module": "advisory", "status": "stub"}
