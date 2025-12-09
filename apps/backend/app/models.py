# apps/backend/app/models.py
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import (
    String,
    Integer,
    TIMESTAMP,
    ForeignKey,
    BigInteger,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base  # ✅ 共用同一個 Base


class Customer(Base):
    __tablename__ = "customers"

    # 你之前用的是 user_id 作 primary key（例如從前端 uid）
    user_id: Mapped[str] = mapped_column(String, primary_key=True)
    email: Mapped[Optional[str]] = mapped_column(String, nullable=True, index=True)
    stripe_customer_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )


class Subscription(Base):
    __tablename__ = "subscriptions"

    # Stripe subscription id
    id: Mapped[str] = mapped_column(String, primary_key=True)

    user_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("customers.user_id", ondelete="CASCADE"),
        index=True,
    )

    price_id: Mapped[str] = mapped_column(String)  # e.g. price_XXXXX
    status: Mapped[str] = mapped_column(String)    # active / trialing / canceled / incomplete / ...

    current_period_end: Mapped[Optional[datetime]] = mapped_column(
        TIMESTAMP(timezone=True),
        nullable=True,
    )

    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )


class EntGrant(Base):
    """
    權限授予表：
    - plan: "starter" | "pro"
    - subject: 例如 "chinese" / "math" / None（代表全科）
    - grade_from, grade_to: 1–6（年級範圍）
    - expires_at: 到期時間（可為 None = 永久）
    """
    __tablename__ = "ent_grants"

    id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True,
        autoincrement=True,
    )

    user_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("customers.user_id", ondelete="CASCADE"),
        index=True,
    )

    plan: Mapped[str] = mapped_column(String)  # "starter" | "pro"

    # None = 所有科目；否則 "chinese" / "math" / "general" 等
    subject: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    grade_from: Mapped[int] = mapped_column(Integer, default=1)
    grade_to: Mapped[int] = mapped_column(Integer, default=6)

    expires_at: Mapped[Optional[datetime]] = mapped_column(
        TIMESTAMP(timezone=True),
        nullable=True,
    )
