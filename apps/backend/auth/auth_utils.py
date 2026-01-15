# apps/backend/auth/auth_utils.py
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict

import jwt

JWT_SECRET = os.getenv("JWT_SECRET", "").strip()
JWT_ALG = os.getenv("JWT_ALG", "HS256")
JWT_EXPIRES_MIN = int(os.getenv("JWT_EXPIRES_MIN", "60"))  # 1 hour default


def create_access_token(payload: Dict[str, Any], expires_minutes: int | None = None) -> str:
    """Create a signed JWT access token.

    payload: will be embedded under standard claims (plus your fields).
    """
    if not JWT_SECRET:
        # Dev-safe default (but you SHOULD set JWT_SECRET in prod!)
        # Using a fixed fallback avoids crashing when running locally.
        secret = "dev-insecure-secret-change-me"
    else:
        secret = JWT_SECRET

    now = datetime.now(timezone.utc)
    exp = now + timedelta(minutes=expires_minutes or JWT_EXPIRES_MIN)

    claims = dict(payload)
    claims.update({
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    })
    return jwt.encode(claims, secret, algorithm=JWT_ALG)
