# apps/backend/app/billing_stripe.py
from __future__ import annotations
import os
from typing import Optional, Dict, Any

import stripe
from fastapi import APIRouter, HTTPException, Header, Request
from pydantic import BaseModel

from .entitlements import add_access  # 你專案已有這支
# 不再匯入 .schemas，以免 ModuleNotFoundError

router = APIRouter(prefix="/api/billing", tags=["billing"])

# --- Stripe 環境變數 ---------------------------------------------------------
STRIPE_SECRET_KEY    = os.getenv("STRIPE_SECRET_KEY")       # sk_live_xxx / sk_test_xxx
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET")  # whsec_xxx

# 你在 Stripe 後台建立的 price id
PRICE_STARTER = os.getenv("PRICE_STARTER")  # e.g. price_123
PRICE_PRO     = os.getenv("PRICE_PRO")      # e.g. price_456

if STRIPE_SECRET_KEY:
    stripe.api_key = STRIPE_SECRET_KEY
# 若沒設定，不在 import 階段報錯，讓服務能啟動；在呼叫端點時再報錯。

# --- 請求模型 ---------------------------------------------------------------
class CheckoutBody(BaseModel):
    plan: str                 # "starter" | "pro"
    subject: Optional[str] = None  # starter 用：e.g. "chinese"
    grade: Optional[str] = None    # starter 用：e.g. "grade1"
    success_url: str
    cancel_url: str

# --- 小工具 -----------------------------------------------------------------
def _ensure_stripe_ready():
    if not STRIPE_SECRET_KEY:
        raise HTTPException(500, "Stripe 未設定（缺少 STRIPE_SECRET_KEY）")
    if not (PRICE_STARTER and PRICE_PRO):
        # 只要用到對應方案卻沒 price id 就報錯
        return

def _pick_price(plan: str) -> str:
    p = (plan or "").strip().lower()
    if p == "starter" and PRICE_STARTER:
        return PRICE_STARTER
    if p == "pro" and PRICE_PRO:
        return PRICE_PRO
    raise HTTPException(400, "不支援的方案或未設定對應的 PRICE_* 環境變數")

# --- 建立 Checkout Session --------------------------------------------------
@router.post("/checkout")
def create_checkout_session(
    body: CheckoutBody,
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
):
    _ensure_stripe_ready()

    if not x_user_id:
        raise HTTPException(400, "Missing X-User-Id")

    price_id = _pick_price(body.plan)

    # 將關鍵資訊放進 metadata，Webhook 會用它來寫入權限
    metadata: Dict[str, Any] = {
        "plan": (body.plan or "starter").lower(),
        "user_id": x_user_id,
        "subject": body.subject or "",
        "grade": body.grade or "",
    }

    try:
        sess = stripe.checkout.Session.create(
            mode="subscription",  # 若是一次性付款可改 "payment"
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=body.success_url + "?session_id={CHECKOUT_SESSION_ID}",
            cancel_url=body.cancel_url,
            allow_promotion_codes=True,
            metadata=metadata,
        )
        return {"url": sess.url}
    except Exception as e:
        raise HTTPException(500, f"Stripe error: {e}")

# --- Webhook：寫入權限 ------------------------------------------------------
@router.post("/webhook")
async def stripe_webhook(request: Request):
    if not STRIPE_WEBHOOK_SECRET:
        raise HTTPException(500, "Stripe Webhook 未設定（缺少 STRIPE_WEBHOOK_SECRET）")

    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    try:
        evt = stripe.Webhook.construct_event(payload=payload, sig_header=sig, secret=STRIPE_WEBHOOK_SECRET)
    except Exception as e:
        raise HTTPException(400, f"Webhook signature verification failed: {e}")

    # 我們只處理完成結帳事件
    if evt.get("type") == "checkout.session.completed":
        s = evt["data"]["object"]
        md = (s.get("metadata") or {})
        plan   = (md.get("plan") or "starter").lower()
        user   = md.get("user_id")
        subject = (md.get("subject") or "") or None
        grade   = (md.get("grade") or "") or None

        if user:
            # pro → 全科全年級；starter → 指定科目年級
            if plan == "pro":
                add_access(user_id=user, scope={"plan": "pro"}, expires_at=None)
            else:
                add_access(user_id=user, scope={
                    "plan": "starter",
                    "subject": subject,
                    "grade": grade,
                }, expires_at=None)

    return {"ok": True}
