# apps/backend/auth/auth_utils.py
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional, List

import jwt  # provided by PyJWT
from fastapi import HTTPException

JWT_SECRET = os.getenv("JWT_SECRET", "").strip()
JWT_ALG = os.getenv("JWT_ALG", "HS256").strip() or "HS256"
JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "43200"))  # 30 days default


def _require_secret() -> str:
    """
    Fail-fast：啟動時就知道環境變數未設置，避免 silent bug。
    """
    if not JWT_SECRET:
        raise RuntimeError("JWT_SECRET is not set in environment variables")
    return JWT_SECRET


def create_access_token(
    user_id: str | int,
    email: str,
    extra: Optional[Dict[str, Any]] = None,
) -> str:
    """
    生成 JWT access token（HS256 預設）。
    - sub: user_id (string)
    - email: email
    - iat / exp: epoch seconds (UTC)
    """
    secret = _require_secret()
    now = datetime.now(timezone.utc)
    exp = now + timedelta(minutes=JWT_EXPIRE_MINUTES)

    payload: Dict[str, Any] = {
        "sub": str(user_id),
        "email": (email or "").strip().lower(),
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    }

    if extra:
        # 避免外部覆蓋核心欄位
        for k, v in extra.items():
            if k in ("sub", "email", "iat", "exp"):
                continue
            payload[k] = v

    return jwt.encode(payload, secret, algorithm=JWT_ALG)


def decode_token(token: str) -> Dict[str, Any]:
    """
    驗證並解碼 JWT。
    任何錯誤統一回 401。
    """
    secret = _require_secret()
    token = (token or "").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing token")

    try:
        data = jwt.decode(token, secret, algorithms=[JWT_ALG])
        # 基本 sanity check
        if "sub" not in data or "email" not in data:
            raise HTTPException(status_code=401, detail="Invalid token payload")
        return data
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def get_bearer_token_from_header(auth_header: Optional[str]) -> str:
    """
    由 "Authorization: Bearer <token>" 取出 token。
    """
    if not auth_header:
        raise HTTPException(status_code=401, detail="Missing Authorization header")

    parts: List[str] = auth_header.strip().split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=401, detail="Invalid Authorization header")

    return parts[1].strip()
