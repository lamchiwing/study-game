# apps/backend/auth/auth_routes.py
from datetime import datetime, timedelta
import random

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from ..database import get_db              # 👈 從上層 backend.database
from ..models import User, LoginCode       # 👈 從上層 backend.models
from .auth_utils import create_access_token
from ..mailer_sendgrid import send_email   # 👈 你原本已經有類似 module

router = APIRouter(prefix="/auth", tags=["auth"])


class RequestCodeIn(BaseModel):
  email: EmailStr


@router.post("/request-code")
def request_code(body: RequestCodeIn, db: Session = Depends(get_db)):
  email = body.email.lower().strip()
  code = f"{random.randint(0, 999999):06d}"
  expires_at = datetime.utcnow() + timedelta(minutes=10)

  login_code = LoginCode(email=email, code=code, expires_at=expires_at)
  db.add(login_code)
  db.commit()

  # 寄 email（簡單版）
  send_email(
    to=email,
    subject="你的登入驗證碼",
    html=f"<p>你的登入驗證碼是：<b>{code}</b>（10 分鐘內有效）</p>",
  )
  return {"ok": True}


class VerifyCodeIn(BaseModel):
  email: EmailStr
  code: str


class AuthOut(BaseModel):
  token: str
  email: EmailStr
  plan: str
  starter_subject: str | None
  starter_grade: str | None


@router.post("/verify-code", response_model=AuthOut)
def verify_code(body: VerifyCodeIn, db: Session = Depends(get_db)):
  email = body.email.lower().strip()
  code = body.code.strip()

  now = datetime.utcnow()
  login_code = (
    db.query(LoginCode)
    .filter(
      LoginCode.email == email,
      LoginCode.code == code,
      LoginCode.used == False,
      LoginCode.expires_at > now,
    )
    .order_by(LoginCode.id.desc())
    .first()
  )
  if not login_code:
    raise HTTPException(status_code=400, detail="驗證碼錯誤或已過期")

  login_code.used = True

  user = db.query(User).filter(User.email == email).first()
  if not user:
    user = User(email=email)
    db.add(user)

  db.commit()
  db.refresh(user)

  token = create_access_token(user_id=user.id, email=user.email)
  return AuthOut(
    token=token,
    email=user.email,
    plan=user.plan,
    starter_subject=user.starter_subject,
    starter_grade=user.starter_grade,
  )
