# apps/backend/app/models.py
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy import String, Integer, Text, TIMESTAMP, func, ForeignKey, BigInteger

class Base(DeclarativeBase):
    pass

class Customer(Base):
    __tablename__ = "customers"
    user_id: Mapped[str] = mapped_column(String, primary_key=True)
    email: Mapped[str | None] = mapped_column(String, nullable=True)
    stripe_customer_id: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[object] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_at: Mapped[object] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now())

class Subscription(Base):
    __tablename__ = "subscriptions"
    id: Mapped[str] = mapped_column(String, primary_key=True)  # stripe subscription id
    user_id: Mapped[str] = mapped_column(String, ForeignKey("customers.user_id", ondelete="CASCADE"), index=True)
    price_id: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String)
    current_period_end: Mapped[object | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    updated_at: Mapped[object] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now())

class EntGrant(Base):
    __tablename__ = "ent_grants"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("customers.user_id", ondelete="CASCADE"), index=True)
    plan: Mapped[str] = mapped_column(String)             # "starter" | "pro"
    subject: Mapped[str | None] = mapped_column(String, nullable=True)  # None 或具體科目
    grade_from: Mapped[int] = mapped_column(Integer, default=1)
    grade_to: Mapped[int] = mapped_column(Integer, default=6)
    expires_at: Mapped[object | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
