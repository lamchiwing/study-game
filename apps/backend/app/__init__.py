# apps/backend/app/__init__.py
"""
app package

This file marks the `app` directory as a Python package so that imports like:

    from app.main import app

and other intra-package imports work correctly when running:
    uvicorn app.main:app

Do NOT put runtime logic here.
"""
