from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import String, Integer, Boolean, TIMESTAMP, func
from sqlalchemy.orm import Mapped, mapped_column

from database import Base
from app.models import User, LoginCode


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)

    # 你 auth_routes.py 有用到 user.plan / starter_subject / starter_grade
    plan: Mapped[str] = mapped_column(String, nullable=False, server_default="free")
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
    code: Mapped[str] = mapped_column(String, nullable=False)

    expires_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
    used: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")

    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )
