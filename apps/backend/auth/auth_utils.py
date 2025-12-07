# apps/backend/auth/auth_utils.py
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
import os
import jwt


JWT_SECRET = os.getenv("JWT_SECRET")
JWT_ALG = os.getenv("JWT_ALG", "HS256")


if not JWT_SECRET:
    # 啟動時就讓你知環境變數未設置，避免 silent bug
    raise RuntimeError("JWT_SECRET is not set in environment variables")


def create_access_token(
    user_id: int,
    email: str,
    expires_minutes: int = 60 * 24 * 30,  # 預設 30 日
) -> str:
    now = datetime.utcnow()
    payload: Dict[str, Any] = {
        "sub": str(user_id),
        "email": email,
        "iat": now,
        "exp": now + timedelta(minutes=expires_minutes),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def decode_token(token: str) -> Optional[dict]:
    try:
        data = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        return data
    except jwt.PyJWTError:
        return None
