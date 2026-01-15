# apps/backend/database.py
from __future__ import annotations

import os
from typing import Generator, Optional

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase, Session

# NOTE:
# - Do NOT crash at import-time if DATABASE_URL is missing.
# - In production, you should set DATABASE_URL.
# - In local/dev, missing DATABASE_URL will raise only when you actually open a DB session.

DATABASE_URL: Optional[str] = os.getenv("DATABASE_URL")


class Base(DeclarativeBase):
    pass


_engine = None
_SessionLocal = None


def _get_engine():
    global _engine
    if _engine is not None:
        return _engine

    url = (os.getenv("DATABASE_URL") or DATABASE_URL or "").strip()
    if not url:
        raise RuntimeError("Missing DATABASE_URL environment variable")

    # Create engine lazily
    _engine = create_engine(url, pool_pre_ping=True)
    return _engine


def SessionLocal() -> Session:
    """Return a new SQLAlchemy Session (lazy-init engine)."""
    global _SessionLocal
    if _SessionLocal is None:
        engine = _get_engine()
        _SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    return _SessionLocal()


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
