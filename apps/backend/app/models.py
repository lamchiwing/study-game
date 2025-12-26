# apps/backend/app/models.py
from __future__ import annotations

from datetime import datetime
from typing import Optional, List

from sqlalchemy import (
    String,
    Integer,
    TIMESTAMP,
    ForeignKey,
    BigInteger,
    func,
    Index,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

# ✅ 共用同一個 Base（來自 apps/backend/database.py）
# （因為你用 uvicorn app.main:app，root = apps/backend）
from database import Base


class Customer(Base):
    """
    儲存前端 user_id（例如 localStorage 的 uid）、email、對應 Stripe customer。
    一個 user_id 對應一行。
    """
    __tablename__ = "customers"

    # 以 user_id 作 primary key（由前端生成/保存）
    user_id: Mapped[str] = mapped_column(String, primary_key=True)

    email: Mapped[Optional[str]] = mapped_column(String, nullable=True, index=True)
    stripe_customer_id: Mapped[Optional[str]] = mapped_column(String, nullable=True, index=True)

    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # relationships（可選，但建議加）
    subscriptions: Mapped[List["Subscription"]] = relationship(
        back_populates="customer",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    grants: Mapped[List["EntGrant"]] = relationship(
        back_populates="customer",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class Subscription(Base):
    """
    儲存每個 Stripe subscription 的狀態：
    - id: Stripe subscription id（如 sub_XXXX）
    - user_id: 對應 customers.user_id
    - price_id: Stripe price id（如 price_XXXX）
    - status: active / trialing / canceled / incomplete / ...
    """
    __tablename__ = "subscriptions"

    # Stripe subscription id
    id: Mapped[str] = mapped_column(String, primary_key=True)

    user_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("customers.user_id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    price_id: Mapped[str] = mapped_column(String, nullable=False)  # e.g. price_XXXXX
    status: Mapped[str] = mapped_column(
        String,
        nullable=False,
        doc="Stripe subscription status: active / trialing / canceled / incomplete / ...",
    )

    current_period_end: Mapped[Optional[datetime]] = mapped_column(
        TIMESTAMP(timezone=True),
        nullable=True,
    )

    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    customer: Mapped["Customer"] = relationship(back_populates="subscriptions")


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
        nullable=False,
    )

    plan: Mapped[str] = mapped_column(
        String,
        nullable=False,
        doc='e.g. "starter" | "pro"',
    )

    # None = 所有科目；否則 "chinese" / "math" / "general" 等
    subject: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    grade_from: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    grade_to: Mapped[int] = mapped_column(Integer, nullable=False, default=6)

    expires_at: Mapped[Optional[datetime]] = mapped_column(
        TIMESTAMP(timezone=True),
        nullable=True,
    )

    customer: Mapped["Customer"] = relationship(back_populates="grants")


# ✅ 額外索引（可選，但實際會加快查詢）
Index("ix_ent_grants_user_plan", EntGrant.user_id, EntGrant.plan)
Index("ix_ent_grants_user_subject", EntGrant.user_id, EntGrant.subject)
Index("ix_subscriptions_user_status", Subscription.user_id, Subscription.status)
