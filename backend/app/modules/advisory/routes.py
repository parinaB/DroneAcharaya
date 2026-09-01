"""Advisory: turns model/ground-truth output into ranked maintenance
actions. No rule set exists anywhere in the repo yet -- this is an
explicit placeholder shape, not fabricated business rules (see the
approved backend plan's "Open items")."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.db.models import HealthScore

router = APIRouter(prefix="/advisory", tags=["advisory"])


@router.get("/latest")
async def latest_advisory(
    session_id: str = Query(..., description="A replay session_id from POST /replay/{run_id}/start"),
    db: Session = Depends(get_db),
) -> dict:
    row = db.execute(
        select(HealthScore).where(HealthScore.session_id == session_id).order_by(HealthScore.id.desc())
    ).scalar_one_or_none()
    return {
        "status": "no advisory logic defined yet",
        "health_index": row.health_index if row else None,
        "fault_type": row.fault_type if row else None,
    }
