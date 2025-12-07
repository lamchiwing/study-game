# apps/backend/auth/auth_routes.py
from datetime import datetime, timedelta
import random
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User, LoginCode
from .auth_utils import create_access_token, decode_token
from ..mailer_sendgrid import send_email  # 你之前已有的 sendgrid 封裝

router = APIRouter(prefix="/auth", tags=["auth"])


# ---------- Request / Verify Code ----------

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
    starter_subject: Optional[str]
    starter_grade: Optional[str]


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
            LoginCode.used == False,          # noqa: E712
            LoginCode.expires_at > now,
        )
        .order_by(LoginCode.id.desc())
        .first()
    )
    if not login_code:
        raise HTTPException(status_code=400, detail="驗證碼錯誤或已過期")

    # 標記此 code 已使用
    login_code.used = True

    # 找或建立 user
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


# ---------- 取得目前登入用戶 /auth/me ----------

class MeOut(BaseModel):
    email: EmailStr
    plan: str
    starter_subject: Optional[str]
    starter_grade: Optional[str]


def _get_token_from_header(authorization: Optional[str]) -> Optional[str]:
    """
    從 Authorization header 抽出 Bearer token
    """
    if not authorization:
        return None
    parts = authorization.split()
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1]
    return None


@router.get("/me", response_model=MeOut)
def get_me(
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(None, alias="Authorization"),
):
    token = _get_token_from_header(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="缺少登入資訊")

    data = decode_token(token)
    if not data or "email" not in data:
        raise HTTPException(status_code=401, detail="Token 無效或已過期")

    email = data["email"].lower().strip()
    user = db.query(User).filter(User.email == email).first()
    if not user:
        # 理論上唔應該發生，如果 token valid 就應該有 user
        raise HTTPException(status_code=404, detail="找不到使用者")

    return MeOut(
        email=user.email,
        plan=user.plan,
        starter_subject=user.starter_subject,
        starter_grade=user.starter_grade,
    )
