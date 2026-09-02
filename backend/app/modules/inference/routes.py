"""Inference: latest health/fault/RUL for a replay session. Ground-truth
stand-in today (see app/modules/inference/service.py) -- same response
shape once real ml/artifacts/ exist (Phase 7), only `source` changes."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.db.models import HealthScore
from app.modules.inference.schemas import HealthScoreOut

router = APIRouter(prefix="/inference", tags=["inference"])


@router.get("/latest", response_model=HealthScoreOut)
async def latest_health_score(
    session_id: str = Query(..., description="A replay session_id from POST /replay/{run_id}/start"),
    db: Session = Depends(get_db),
) -> HealthScore:
    row = db.execute(
        select(HealthScore).where(HealthScore.session_id == session_id).order_by(HealthScore.id.desc()).limit(1)
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail=f"no health score written yet for session {session_id!r}")
    return row
