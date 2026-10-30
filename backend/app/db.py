from __future__ import annotations

import os
from sqlmodel import Session, SQLModel, create_engine

from app.domain import models  # noqa: F401


def get_database_url() -> str:
    return os.environ.get("DATABASE_URL", "sqlite:///./partyplanner.db")


engine = create_engine(
    get_database_url(),
    connect_args={"check_same_thread": False},
)


def init_db() -> None:
    SQLModel.metadata.create_all(engine)


def reset_db() -> None:
    SQLModel.metadata.drop_all(engine)


def get_session():
    with Session(engine) as session:
        yield session
