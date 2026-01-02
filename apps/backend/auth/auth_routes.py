# apps/backend/auth/auth_routes.py
from __future__ import annotations

from datetime import datetime, timedelta
import random

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

# ✅ Render 用 `uvicorn app.main:app`，PYTHONPATH root = apps/backend
# - database.py 係放喺 apps/backend/database.py → 可以頂層 import
# - 但你嘅 User/LoginCode 多數係放喺 apps/backend/app/models.py → 必須用 app.models
from database import get_db  # apps/backend/database.py
from app.models import User, LoginCode  # ✅ apps/backend/app/models.py（避免 No module named 'models'）
from mailer_sendgrid import send_email  # apps/backend/mailer_sendgrid.py

from .auth_utils import create_access_token

router = APIRouter(prefix="/auth", tags=["auth"])


# ================== Schemas ==================
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


# ================== Helpers ==================
def _clean_email(e: str) -> str:
    return (e or "").lower().strip()


def _clean_code(c: str) -> str:
    # 允許用戶輸入有空格，例如 "123 456"
    return "".join(ch for ch in (c or "") if ch.isdigit()).strip()


# ================== Routes ==================
@router.post("/request-code")
def request_code(body: RequestCodeIn, db: Session = Depends(get_db)):
    email = _clean_email(body.email)
    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="email is required",
        )

    code = f"{random.randint(0, 999999):06d}"
    expires_at = datetime.utcnow() + timedelta(minutes=10)

    login_code = LoginCode(
        email=email,
        code=code,
        expires_at=expires_at,
        used=False,
    )
    db.add(login_code)
    db.commit()

    # 寄 email（如 sendgrid 失敗，回 502 方便前端提示）
    try:
        send_email(
            to=email,
            subject="你的登入驗證碼",
            html=f"<p>你的登入驗證碼是：<b>{code}</b>（10 分鐘內有效）</p>",
        )
    except Exception:
        # ⚠️ 不建議把 exception 內容直接回傳俾前端（可能包含敏感資訊）
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="failed to send email",
        )

    return {"ok": True}


@router.post("/verify-code", response_model=AuthOut)
def verify_code(body: VerifyCodeIn, db: Session = Depends(get_db)):
    email = _clean_email(body.email)
    code = _clean_code(body.code)

    if not email or len(code) != 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="invalid email or code",
        )

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
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="驗證碼錯誤或已過期",
        )

    # ✅ mark used
    login_code.used = True

    # ✅ upsert user
    user = db.query(User).filter(User.email == email).first()
    if not user:
        user = User(email=email)
        db.add(user)

    db.commit()
    db.refresh(user)

    token = create_access_token(user_id=user.id, email=user.email)

    # 注意：以下欄位要同你嘅 User model 對應
    plan = getattr(user, "plan", None) or "free"
    starter_subject = getattr(user, "starter_subject", None)
    starter_grade = getattr(user, "starter_grade", None)

    return AuthOut(
        token=token,
        email=user.email,
        plan=plan,
        starter_subject=starter_subject,
        starter_grade=starter_grade,
    )
