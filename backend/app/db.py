"""Database engine configuration, SQLite WAL tuning, and session lifecycle."""

from __future__ import annotations

import os
from typing import Any, Generator
from sqlalchemy import event
from sqlmodel import Session, SQLModel, create_engine

from app.domain import models  # noqa: F401


def get_database_url() -> str:
    """Resolve database connection URL from environment or local SQLite default."""
    return os.environ.get("DATABASE_URL", "sqlite:///./partyplanner.db")


engine = create_engine(
    get_database_url(),
    connect_args={"check_same_thread": False},
)


@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_connection: Any, _connection_record: Any) -> None:
    """Enable WAL journaling and fast synchronous mode for SQLite concurrency & efficiency."""
    cursor = dbapi_connection.cursor()
    try:
        cursor.execute("PRAGMA journal_mode=WAL;")
        cursor.execute("PRAGMA synchronous=NORMAL;")
        cursor.execute("PRAGMA temp_store=MEMORY;")
    finally:
        cursor.close()


def init_db() -> None:
    """Initialize all SQLModel tables and indexes."""
    SQLModel.metadata.create_all(engine)


def reset_db() -> None:
    """Drop all SQLModel tables (used by test fixtures)."""
    SQLModel.metadata.drop_all(engine)


def get_session() -> Generator[Session, None, None]:
    """Provide a transactional database session per request."""
    with Session(engine) as session:
        yield session
