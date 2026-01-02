# apps/backend/auth/auth_utils.py
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

import jwt  # comes from PyJWT
from fastapi import HTTPException

JWT_SECRET = os.getenv("JWT_SECRET", "")
JWT_ALG = os.getenv("JWT_ALG", "HS256")
JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "43200"))  # 30 days default


def _require_secret() -> str:
    if not JWT_SECRET:
        # ✅ 建議要加：部署時冇 SECRET 會直接 fail-fast
        raise RuntimeError("JWT_SECRET is not set in environment variables")
    return JWT_SECRET


def create_access_token(user_id: str, email: str, extra: Optional[Dict[str, Any]] = None) -> str:
    secret = _require_secret()
    now = datetime.now(timezone.utc)
    exp = now + timedelta(minutes=JWT_EXPIRE_MINUTES)

    payload: Dict[str, Any] = {
        "sub": str(user_id),
        "email": email,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    }
    if extra:
        payload.update(extra)

    return jwt.encode(payload, secret, algorithm=JWT_ALG)


def decode_token(token: str) -> Dict[str, Any]:
    secret = _require_secret()
    try:
        return jwt.decode(token, secret, algorithms=[JWT_ALG])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
