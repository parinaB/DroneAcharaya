"""Aggregates every module router under a single versioned API prefix."""

from fastapi import APIRouter

from app.modules.advisory.routes import router as advisory_router
from app.modules.inference.routes import router as inference_router
from app.modules.ingestion.routes import router as ingestion_router
from app.modules.replay.routes import router as replay_router

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(ingestion_router)
api_router.include_router(inference_router)
api_router.include_router(advisory_router)
api_router.include_router(replay_router)
