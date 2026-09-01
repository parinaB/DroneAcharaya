"""Ingestion: reports current bridge/session state. There's no external
live producer yet (Step 9's "seam where Simulink engine later swaps to
real ECU" isn't built) -- this becomes meaningful again once one exists;
for now it just reflects replay session activity."""

from __future__ import annotations

from fastapi import APIRouter

from app.modules.replay import service

router = APIRouter(prefix="/ingestion", tags=["ingestion"])


@router.get("/status")
async def ingestion_status() -> dict:
    return {
        "module": "ingestion",
        "mode": "replay-only (no live ECU/CAN source exists yet)",
        "active_sessions": service.active_session_count(),
    }
