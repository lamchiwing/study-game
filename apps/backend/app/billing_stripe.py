# apps/backend/app/billing_stripe.py
from __future__ import annotations
import os
from typing import Optional, Dict, Any

import stripe
from fastapi import APIRouter, HTTPException, Header, Request
from pydantic import BaseModel

# 你專案既有的「寫入權限」函式（保持不變）
from .entitlements import add_access

router = APIRouter(prefix="/api/billing", tags=["billing"])

# --- Stripe 環境變數（請在 Render 設定） --------------------------------------
STRIPE_SECRET_KEY     = os.getenv("STRIPE_SECRET_KEY")        # sk_live_xxx / sk_test_xxx
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET")    # whsec_xxx

# ✅ 使用統一命名（和你後端其他地方一致）
STRIPE_PRICE_STARTER  = os.getenv("STRIPE_PRICE_STARTER")     # 形如 price_1Qxxxx...
STRIPE_PRICE_PRO      = os.getenv("STRIPE_PRICE_PRO")         # 形如 price_1Qyyyy...

if STRIPE_SECRET_KEY:
    stripe.api_key = STRIPE_SECRET_KEY
# 若未設定，不在 import 階段報錯；等呼叫端點時再報清楚的 HTTPException。

# 讓 webhook 能從 price_id 反推方案（後備用）
PRICE_TO_PLAN: Dict[Optional[str], str] = {
    STRIPE_PRICE_STARTER: "starter",
    STRIPE_PRICE_PRO: "pro",
}

# --- 請求模型 ----------------------------------------------------------------
class CheckoutBody(BaseModel):
    plan: str                       # "starter" | "pro"
    subject: Optional[str] = None   # starter 用（可選）
    grade: Optional[str] = None     # starter 用（可選）
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
    # 理論上不會走到這裡，交給 _ensure_stripe_ready 先擋
    raise HTTPException(400, "方案未配置對應的 Price ID")

# --- 建立 Checkout Session ---------------------------------------------------
@router.post("/checkout")
def create_checkout_session(
    body: CheckoutBody,
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
):
    """
    建立 Stripe Checkout Session
    - 接受 plan（starter/pro）
    - 前端可帶 success_url / cancel_url
    - 會把 user_id / plan / subject / grade 放進 metadata
    - 回傳 { id, url }，前端可直接導向 url
    """
    plan = (body.plan or "starter").lower()
    _ensure_stripe_ready(plan)

    # X-User-Id 可選：缺少時自動生成匿名 uid（避免前端漏傳時 400）
    user_id = x_user_id or ""
    if not user_id:
        import uuid
        user_id = f"anon_{uuid.uuid4()}"

    price_id = _pick_price(plan)

    # 放到 metadata（Webhook 使用），同時也放 client_reference_id（更好對回）
    metadata: Dict[str, Any] = {
        "plan": plan,
        "user_id": user_id,
    }
    if plan == "starter":
        metadata["subject"] = body.subject or ""
        metadata["grade"] = body.grade or ""

    try:
        sess = stripe.checkout.Session.create(
            mode="subscription",  # 一次性付款請改 "payment"
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=body.success_url + "?session_id={CHECKOUT_SESSION_ID}",
            cancel_url=body.cancel_url,
            allow_promotion_codes=True,
            client_reference_id=user_id,
            metadata=metadata,
        )
        return {"id": sess.id, "url": sess.url}
    except Exception as e:
        # 將 Stripe 原訊息帶回，方便排查（仍以 400 回應避免暴露太多）
        raise HTTPException(400, f"Create session failed: {e}")

# --- Webhook：依付款結果寫入權限 ---------------------------------------------
@router.post("/webhook")
async def stripe_webhook(request: Request):
    """
    請在 Stripe Dashboard → Developers → Webhooks
    endpoint 設為：<你的域名>/api/billing/webhook
    並至少勾選：
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
    data = evt["data"]["object"]

    # 1) 結帳完成：依 metadata / price 判定方案，寫入權限
    if etype == "checkout.session.completed":
        md = (data.get("metadata") or {})
        uid = data.get("client_reference_id") or md.get("user_id")
        plan = (md.get("plan") or "").lower()

        # 後備：若 metadata 沒 plan，就從 subscription price 判斷
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

        # 寫入權限
        if uid:
            if plan == "pro":
                # 你的 add_access 寫法：pro 方案，不限科目年級
                add_access(user_id=uid, scope={"plan": "pro"}, expires_at=None)
            else:
                subject = (md.get("subject") or "") or None
                grade = (md.get("grade") or "") or None
                add_access(
                    user_id=uid,
                    scope={"plan": "starter", "subject": subject, "grade": grade},
                    expires_at=None,
                )

    # 2) 訂閱更新：如升降級、價格變動
    elif etype == "customer.subscription.updated":
        sub = data
        # 嘗試從 metadata 取得 uid，否則（實務上）可在 Customer/Subscription.metadata 儲存 uid
        uid = (sub.get("metadata") or {}).get("uid")
        items = sub.get("items", {}).get("data", [])
        price_id = items[0]["price"]["id"] if items else None
        plan = PRICE_TO_PLAN.get(price_id, "starter")
        if uid:
            if plan == "pro":
                add_access(user_id=uid, scope={"plan": "pro"}, expires_at=None)
            else:
                # 降回 starter（不清楚 subject/grade 時，先給空白，待用戶下次選擇）
                add_access(user_id=uid, scope={"plan": "starter"}, expires_at=None)

    # 3) 訂閱刪除/取消：降回 starter（或 free）
    elif etype == "customer.subscription.deleted":
        uid = (data.get("metadata") or {}).get("uid")
        if uid:
            add_access(user_id=uid, scope={"plan": "starter"}, expires_at=None)

    return {"ok": True}
