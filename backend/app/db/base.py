"""SQLAlchemy engine/session setup.

Dialect-agnostic on purpose: no TimescaleDB/hypertable calls anywhere in
this package (see ops/infra/README.md for why that was dropped) — the exact
same models/migrations run against the local SQLite dev default and against
Supabase's Postgres in production, via Settings.database_url alone.
"""

from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import get_settings


class Base(DeclarativeBase):
    """Shared declarative base for every ORM model in app/db/models.py."""


def _make_engine():
    settings = get_settings()
    connect_args = {}
    if settings.database_url.startswith("sqlite"):
        # Needed for SQLite when used from FastAPI's threaded request
        # handling; irrelevant for Postgres.
        connect_args["check_same_thread"] = False
    return create_engine(settings.database_url, connect_args=connect_args)


engine = _make_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency yielding a request-scoped Session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
