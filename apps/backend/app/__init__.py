"""
app package

This file marks the `app` directory as a Python package so that imports like:

    from app.main import app
    from app.models import User
    from app.entitlements import has_access

work correctly when running:
    uvicorn app.main:app

Do NOT put runtime logic here.
"""
