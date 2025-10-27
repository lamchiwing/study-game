# apps/backend/app/entitlement_api.py
from __future__ import annotations
from fastapi import APIRouter, Header
from .entitlements_store import get_user_plan
from .entitlements import ads_enabled, report_enabled, max_students

router = APIRouter()

@router.get("/api/user/entitlement")
def get_entitlement(x_user_id: str = Header(..., alias="X-User-Id")):
    plan = get_user_plan(x_user_id)
    return {
        "plan": plan,
        "ads_enabled": ads_enabled(plan),
        "report_enabled": report_enabled(plan),
        "max_students": max_students(plan),
    }
