# apps/backend/auth/auth_routes.py
from __future__ import annotations

from datetime import datetime, timedelta
import random

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from database import get_db
from mailer_sendgrid import send_email
from .auth_utils import create_access_token

router = APIRouter(prefix="/auth", tags=["auth"])


class RequestCodeIn(BaseModel):
    email: EmailStr


class VerifyCodeIn(BaseModel):
    email: EmailStr
    code: str


class AuthOut(BaseModel):
    token: str
    email: EmailStr
    plan: str
    starter_subject: str | None = None
    starter_grade: str | None = None


def _clean_email(e: str) -> str:
    return (e or "").lower().strip()


def _clean_code(c: str) -> str:
    return "".join(ch for ch in (c or "") if ch.isdigit()).strip()


@router.post("/request-code")
def request_code(body: RequestCodeIn, db: Session = Depends(get_db)):
    email = _clean_email(body.email)
    if not email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="email is required")

    code = f"{random.randint(0, 999999):06d}"
    expires_at = datetime.utcnow() + timedelta(minutes=10)

    login_code = LoginCode(email=email, code=code, expires_at=expires_at, used=False)
    db.add(login_code)
    db.commit()

    try:
        send_email(
            to=email,
            subject="你的登入驗證碼",
            html=f"<p>你的登入驗證碼是：<b>{code}</b>（10 分鐘內有效）</p>",
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"failed to send email: {e}",
        )

    return {"ok": True}


@router.post("/verify-code", response_model=AuthOut)
def verify_code(body: VerifyCodeIn, db: Session = Depends(get_db)):
    email = _clean_email(body.email)
    code = _clean_code(body.code)

    if not email or not code or len(code) != 6:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid email or code")

    now = datetime.utcnow()

    login_code = (
        db.query(LoginCode)
        .filter(
            LoginCode.email == email,
            LoginCode.code == code,
            LoginCode.used.is_(False),
            LoginCode.expires_at > now,
        )
        .order_by(LoginCode.id.desc())
        .first()
    )
    if not login_code:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="驗證碼錯誤或已過期")

    login_code.used = True

    user = db.query(User).filter(User.email == email).first()
    if not user:
        user = User(email=email)
        db.add(user)

    db.commit()
    db.refresh(user)

    token = create_access_token(user_id=str(user.id), email=user.email)

    return AuthOut(
        token=token,
        email=user.email,
        plan=user.plan or "free",
        starter_subject=user.starter_subject,
        starter_grade=user.starter_grade,
    )
