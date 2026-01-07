# apps/backend/app/models/__init__.py
"""
app.models package

Re-export commonly used SQLAlchemy models so imports like:

    from app.models import User, LoginCode

work consistently.
"""

from .models import Customer, Subscription, EntGrant  # existing models file

# ✅ 如果你已經有 User / LoginCode，確保它哋係喺同一個 models.py 內
# 如果 User/LoginCode 係另一個檔案，就改為 from .user_models import User, LoginCode
try:
    from .user_auth_models import User, LoginCode  # if you split them out
except Exception:
    # fallback: maybe they live in models.py
    try:
        from .models import User, LoginCode  # type: ignore
    except Exception:
        # let import error surface at runtime if you actually need them
        pass

