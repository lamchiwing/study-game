# apps/backend/app/models/user_auth_models.py
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import String, Integer, Boolean, TIMESTAMP, func, Index
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)

    plan: Mapped[str] = mapped_column(String, nullable=False, default="free")
    starter_subject: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    starter_grade: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class LoginCode(Base):
    __tablename__ = "login_codes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    email: Mapped[str] = mapped_column(String, index=True, nullable=False)
    code: Mapped[str] = mapped_column(String(6), nullable=False)

    used: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    expires_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=False), nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )


Index("ix_login_codes_email_code_used", LoginCode.email, LoginCode.code, LoginCode.used)
