# apps/backend/models.py
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Boolean
from .database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # 訂閱相關
    plan = Column(String, default="free")  # free | starter | pro
    starter_subject = Column(String, nullable=True)  # e.g. "chinese"
    starter_grade = Column(String, nullable=True)    # e.g. "grade3"


class LoginCode(Base):
    __tablename__ = "login_codes"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, index=True, nullable=False)
    code = Column(String, nullable=False)  # 可以之後改為 hash
    expires_at = Column(DateTime, nullable=False)
    used = Column(Boolean, default=False)
