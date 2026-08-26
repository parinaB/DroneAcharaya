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


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance."""
    return Settings()
