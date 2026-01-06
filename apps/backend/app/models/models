#apps/backend/app/models/models.py
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

from database import Base


class Customer(Base):
    __tablename__ = "customers"

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
    __tablename__ = "subscriptions"

    id: Mapped[str] = mapped_column(String, primary_key=True)

    user_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("customers.user_id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    price_id: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False)

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

    plan: Mapped[str] = mapped_column(String, nullable=False)
    subject: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    grade_from: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    grade_to: Mapped[int] = mapped_column(Integer, nullable=False, default=6)

    expires_at: Mapped[Optional[datetime]] = mapped_column(
        TIMESTAMP(timezone=True),
        nullable=True,
    )

    customer: Mapped["Customer"] = relationship(back_populates="grants")


Index("ix_ent_grants_user_plan", EntGrant.user_id, EntGrant.plan)
Index("ix_ent_grants_user_subject", EntGrant.user_id, EntGrant.subject)
Index("ix_subscriptions_user_status", Subscription.user_id, Subscription.status)
