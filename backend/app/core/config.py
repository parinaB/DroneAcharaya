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

    # Origins allowed to call this API (the Next.js dev server by default).
    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]

    # Filesystem roots. Defaults resolve relative to the repository root.
    artifacts_dir: Path = Path("../ml/artifacts")
    data_dir: Path = Path("../data")

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
