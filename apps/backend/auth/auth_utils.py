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


# apps/backend/auth/auth_utils.py
from datetime import datetime, timedelta
from typing import Optional
import os
import jwt

JWT_SECRET = os.environ["JWT_SECRET"]          # 👈 必須在 Render 設定 env
JWT_ALG = os.environ.get("JWT_ALG", "HS256")   # 默认 HS256


def create_access_token(
  user_id: int,
  email: str,
  expires_minutes: int = 60 * 24 * 30  # 30 日
):
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
