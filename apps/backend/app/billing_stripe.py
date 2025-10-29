# apps/backend/app/billing_stripe.py
from __future__ import annotations
import os
from typing import Optional, Dict, Any

import stripe
from fastapi import APIRouter, HTTPException, Header, Request
from pydantic import BaseModel

# ✅ 從新版 entitlements 匯入資料庫函式
from .entitlements import add_access, upsert_customer

router = APIRouter(prefix="/api/billing", tags=["billing"])

# --- Stripe 環境變數（請在 Render 設定） --------------------------------------
STRIPE_SECRET_KEY     = os.getenv("STRIPE_SECRET_KEY")        # sk_live_xxx / sk_test_xxx
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET")    # whsec_xxx

# ✅ 統一命名（和 Render 上設定的變數一致）
STRIPE_PRICE_STARTER  = os.getenv("STRIPE_PRICE_STARTER")     # 形如 price_1Qxxxx...
STRIPE_PRICE_PRO      = os.getenv("STRIPE_PRICE_PRO")         # 形如 price_1Qyyyy...

if STRIPE_SECRET_KEY:
    stripe.api_key = STRIPE_SECRET_KEY

# 讓 webhook 能從 price_id 反推方案（後備用）
PRICE_TO_PLAN: Dict[Optional[str], str] = {
    STRIPE_PRICE_STARTER: "starter",
    STRIPE_PRICE_PRO: "pro",
}

# --- 請求模型 ----------------------------------------------------------------
class CheckoutBody(BaseModel):
    plan: str                       # "starter" | "pro"
    subject: Optional[str] = None   # starter 用
    grade: Optional[str] = None     # starter 用
    subjects_csv: Optional[str] = None  # pro 用（例："math,chinese"）
    grades_csv: Optional[str] = None    # pro 用（例："grade1,grade3"）
    success_url: str
    cancel_url: str

# --- 小工具 ------------------------------------------------------------------
def _ensure_stripe_ready(plan: str):
    if not STRIPE_SECRET_KEY:
        raise HTTPException(500, "Stripe 未設定（缺少 STRIPE_SECRET_KEY）")
    p = (plan or "").strip().lower()
    if p == "starter" and not STRIPE_PRICE_STARTER:
        raise HTTPException(500, "缺少 STRIPE_PRICE_STARTER")
    if p == "pro" and not STRIPE_PRICE_PRO:
        raise HTTPException(500, "缺少 STRIPE_PRICE_PRO")
    if p not in ("starter", "pro"):
        raise HTTPException(400, f"不支援的方案：{plan}")

def _pick_price(plan: str) -> str:
    p = (plan or "").strip().lower()
    if p == "starter" and STRIPE_PRICE_STARTER:
        return STRIPE_PRICE_STARTER
    if p == "pro" and STRIPE_PRICE_PRO:
        return STRIPE_PRICE_PRO
    raise HTTPException(400, "方案未配置對應的 Price ID")

# --- 建立 Checkout Session ---------------------------------------------------
@router.post("/checkout")
def create_checkout_session(
    body: CheckoutBody,
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
):
    """
    建立 Stripe Checkout Session
    - Starter：subject + grade（單一組）
    - Pro：subjects_csv + grades_csv（最多兩組）
    - 付款成功後由 Webhook 寫入授權
    """
    plan = (body.plan or "starter").lower()
    _ensure_stripe_ready(plan)

    # 若未帶 user_id，則自動生成匿名 ID
    user_id = x_user_id or ""
    if not user_id:
        import uuid
        user_id = f"anon_{uuid.uuid4()}"

    price_id = _pick_price(plan)

    # Metadata 給 webhook 用
    metadata: Dict[str, Any] = {"plan": plan, "user_id": user_id}
    if plan == "starter":
        metadata["subject"] = body.subject or ""
        metadata["grade"] = body.grade or ""
    else:
        metadata["subjects_csv"] = body.subjects_csv or ""
        metadata["grades_csv"] = body.grades_csv or ""

    try:
        sess = stripe.checkout.Session.create(
            mode="subscription",
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=body.success_url + "?session_id={CHECKOUT_SESSION_ID}",
            cancel_url=body.cancel_url,
            allow_promotion_codes=True,
            client_reference_id=user_id,
            metadata=metadata,
        )
        return {"id": sess.id, "url": sess.url}
    except Exception as e:
        raise HTTPException(400, f"Create session failed: {e}")

# --- Webhook：依付款結果寫入權限 ---------------------------------------------
@router.post("/webhook")
async def stripe_webhook(request: Request):
    """
    Stripe Dashboard → Developers → Webhooks
    endpoint: <你的域名>/api/billing/webhook
    勾選事件：
      - checkout.session.completed
      - customer.subscription.updated
      - customer.subscription.deleted
    """
    if not STRIPE_WEBHOOK_SECRET:
        raise HTTPException(500, "Stripe Webhook 未設定（缺少 STRIPE_WEBHOOK_SECRET）")

    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    try:
        evt = stripe.Webhook.construct_event(payload=payload, sig_header=sig, secret=STRIPE_WEBHOOK_SECRET)
    except Exception as e:
        raise HTTPException(400, f"Webhook signature verification failed: {e}")

    etype = evt.get("type")
    data  = evt["data"]["object"]

    # ------------------------------------------------------------------
    # 1) 結帳完成：依 metadata / price 判定方案
    # ------------------------------------------------------------------
    if etype == "checkout.session.completed":
        md  = (data.get("metadata") or {})
        uid = data.get("client_reference_id") or md.get("user_id")
        plan = (md.get("plan") or "").strip().lower()

        # 嘗試取得顧客 email，方便日後寄報告
        email = None
        if data.get("customer_details") and data["customer_details"].get("email"):
            email = data["customer_details"]["email"]
        elif data.get("customer"):
            try:
                cust = stripe.Customer.retrieve(data["customer"])
                email = cust.get("email")
            except Exception:
                pass
        if uid and email:
            upsert_customer(uid, email, data.get("customer"))

        # 後備：若 metadata 無 plan，從 subscription price 判斷
        if not plan:
            sub_id = data.get("subscription")
            if sub_id:
                try:
                    sub = stripe.Subscription.retrieve(sub_id)
                    items = sub.get("items", {}).get("data", [])
                    price_id = items[0]["price"]["id"] if items else None
                    plan = PRICE_TO_PLAN.get(price_id, "starter")
                except Exception:
                    plan = "starter"
            else:
                plan = "starter"

        # 寫入權限 ---------------------------------------------------------
        if uid:
            if plan == "starter":
                subject = (md.get("subject") or "").strip()
                grade   = (md.get("grade")   or "").strip()
                if subject and grade:
                    add_access(uid, {"plan": "starter", "subject": subject, "grade": grade}, expires_at=None)
                else:
                    add_access(uid, {"plan": "starter"}, expires_at=None)
            elif plan == "pro":
                subjects = [x.strip() for x in (md.get("subjects_csv") or "").split(",") if x.strip()]
                grades   = [x.strip() for x in (md.get("grades_csv") or "").split(",") if x.strip()]
                pairs = list(zip(subjects, grades))[:2]
                if pairs:
                    for subj, grd in pairs:
                        add_access(uid, {"plan": "pro", "subject": subj, "grade": grd}, expires_at=None)
                else:
                    add_access(uid, {"plan": "pro"}, expires_at=None)

    # ------------------------------------------------------------------
    # 2) 訂閱更新（升級／降級）
    # ------------------------------------------------------------------
    elif etype == "customer.subscription.updated":
        sub = data
        uid = (sub.get("metadata") or {}).get("uid")
        items = sub.get("items", {}).get("data", [])
        price_id = items[0]["price"]["id"] if items else None
        plan = PRICE_TO_PLAN.get(price_id, "starter")

        if uid:
            if plan == "pro":
                add_access(uid, {"plan": "pro"}, expires_at=None)
            else:
                add_access(uid, {"plan": "starter"}, expires_at=None)

    # ------------------------------------------------------------------
    # 3) 訂閱取消：降回 starter 或 free（這裡選 starter）
    # ------------------------------------------------------------------
    elif etype == "customer.subscription.deleted":
        uid = (data.get("metadata") or {}).get("uid")
        if uid:
            add_access(uid, {"plan": "starter"}, expires_at=None)

    return {"ok": True}
