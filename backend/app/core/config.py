"""Application configuration sourced from environment variables / .env."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Environment-driven settings for the DroneAcharaya backend."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "DroneAcharaya API"
    app_version: str = "0.1.0"
    log_level: str = "INFO"

    # Origins allowed to call this API: the Next.js dev server, plus the
    # deployed Vercel frontend. Vercel also issues per-branch preview URLs
    # (drone-acharaya-git-<branch>-<scope>.vercel.app) -- add those here too
    # if a preview deployment ever needs to hit this API.
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://drone-acharaya.vercel.app",
    ]

    # Filesystem roots. Defaults resolve relative to the repository root
    # (i.e. assume CWD is backend/, per `cd backend && uvicorn ...`).
    artifacts_dir: Path = Path("../ml/artifacts")
    data_dir: Path = Path("../data")

    # Which ml/artifacts/lstm_rul/<version> to load. Bump when a new
    # checkpoint replaces v1 -- see ml/artifacts/lstm_rul/v1/metadata.json.
    lstm_rul_version: str = "v1"

    # Which ml/artifacts/xgboost_classifier/<version> to load. Bump when a
    # new pair of models replaces v1 -- see
    # ml/artifacts/xgboost_classifier/v1/metadata.json.
    xgboost_classifier_version: str = "v1"

    # Which ml/artifacts/autoencoder/<version> to load. Must stay paired with
    # the matching ml/artifacts/digital_twin/<version> (v3 with v3, never
    # mixed) -- see ml/training/autoencoder/README.md.
    autoencoder_version: str = "v3"

    # Defaults to a local SQLite file so `uvicorn app.main:app --reload`
    # works with zero setup. Production points this at Supabase's Postgres
    # connection-pooler string via the DATABASE_URL env var / backend/.env
    # (not committed) -- nothing in backend/app/db/ is Postgres-specific
    # (no TimescaleDB/hypertables, see ops/infra/README.md for why), so the
    # same code path runs against either.
    database_url: str = "sqlite:///./dev.db"

    # Render injects its own PORT at runtime; unused by the app directly
    # (uvicorn's CMD reads it), kept here only so it's a documented setting.
    port: int = 8000


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance."""
    return Settings()
