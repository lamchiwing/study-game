# apps/backend/app/db.py
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL")  # e.g. postgresql+psycopg://user:pass@host:5432/db

if not DATABASE_URL:
    raise RuntimeError("Missing DATABASE_URL for Postgres")

engine = create_engine(DATABASE_URL, pool_pre_ping=True, future=True)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False, future=True)
