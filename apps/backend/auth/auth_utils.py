# apps/backend/auth/auth_utils.py
from datetime import datetime, timedelta
from typing import Optional
import os
import jwt

JWT_SECRET = os.environ.get("JWT_SECRET")
JWT_ALG = os.environ.get("JWT_ALG", "HS256")

# 🔒 防止 silent bug（推薦）
if not JWT_SECRET:
    raise RuntimeError("❌ JWT_SECRET is not set! Please add it in Render → Environment.")

def create_access_token(user_id: int, email: str, expires_minutes: int = 60 * 24 * 30):
    payload = {
        "sub": str(user_id),
        "email": email,
        "exp": datetime.utcnow() + timedelta(minutes=expires_minutes),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)

def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.PyJWTError:
        return None
