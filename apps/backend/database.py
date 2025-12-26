# apps/backend/database.py
from __future__ import annotations

import os
from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase, Session

# 例：postgresql+psycopg://user:pass@host:5432/dbname
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("Missing DATABASE_URL environment variable")

# 建立 Engine（prod 建議唔開 echo，避免太多 SQL log）
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    future=True,
)

# Session factory
SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
    future=True,
)


class Base(DeclarativeBase):
    """所有 ORM model 都要繼承呢個 Base"""
    pass


def get_db() -> Generator[Session, None, None]:
    """
    FastAPI 依賴注入用：
        from sqlalchemy.orm import Session
        from fastapi import Depends

        @router.get("/x")
        def handler(db: Session = Depends(get_db)):
            ...
    """
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()
