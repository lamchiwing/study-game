# apps/backend/app/routers/entitlement_api.py
from __future__ import annotations
from fastapi import APIRouter, Header, HTTPException

# 全部從新的 entitlements（DB 版）匯入
from ..entitlements import (
    current_plan,
    ads_enabled,
    report_enabled,
    max_students,
    get_entitlement,
)

router = APIRouter(prefix="/api/user", tags=["user"])

@router.get("/entitlement")
def read_entitlement(x_user_id: str = Header(..., alias="X-User-Id")):
    if not x_user_id:
        raise HTTPException(400, "Missing X-User-Id")

    plan = current_plan(x_user_id)
    return {
        "plan": plan,
        "ads_enabled": ads_enabled(plan),
        "report_enabled": report_enabled(plan),
        "max_students": max_students(plan),
        "raw": get_entitlement(x_user_id) or {"grants": []},
    }
