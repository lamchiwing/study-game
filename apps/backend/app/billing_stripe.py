# apps/backend/app/billing_stripe.py
import os, stripe, datetime as dt
from fastapi import APIRouter, HTTPException, Header, Request
from pydantic import BaseModel
from .entitlements import add_access  # 你專案已有這層；若名稱不同請對應
from .schemas import Entitlement  # 如無可內建簡版 model
# 環境變數
STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY")  # sk_live_xxx 或 sk_test_xxx
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET")  # webhook signing secret

if not STRIPE_SECRET_KEY:
    raise RuntimeError("Missing STRIPE_SECRET_KEY")
stripe.api_key = STRIPE_SECRET_KEY

router = APIRouter(prefix="/api/billing", tags=["billing"])

class CheckoutBody(BaseModel):
    plan: str                 # "starter" | "pro"
    subject: str | None = None  # starter 用：e.g. "chinese"
    grade: str | None = None    # starter 用：e.g. "grade1"
    success_url: str
    cancel_url: str

# 你可在 Stripe 後台先建好 Products/Prices，把 price id 放到環境變數
PRICE_STARTER = os.getenv("PRICE_STARTER")  # e.g. price_123
PRICE_PRO     = os.getenv("PRICE_PRO")

def _pick_price(plan: str) -> str:
    if plan == "starter" and PRICE_STARTER: return PRICE_STARTER
    if plan == "pro" and PRICE_PRO: return PRICE_PRO
    raise HTTPException(400, "Unsupported plan or price not configured")

@router.post("/checkout")
def create_checkout_session(body: CheckoutBody, x_user_id: str | None = Header(default=None, alias="X-User-Id")):
    if not x_user_id:
        # 前端可用 localStorage 的 uid；若匿名，也可以先讓他輸 email，由 Stripe customer_email 收集
        raise HTTPException(400, "Missing X-User-Id")

    price_id = _pick_price(body.plan)

    # 把科目/年級等放進 metadata，Webhook 會用來寫入權限
    metadata = {
        "plan": body.plan,
        "user_id": x_user_id,
        "subject": body.subject or "",
        "grade": body.grade or "",
    }

    try:
        sess = stripe.checkout.Session.create(
            mode="subscription",                  # 若做單次購買可用 "payment"
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=body.success_url + "?session_id={CHECKOUT_SESSION_ID}",
            cancel_url=body.cancel_url,
            allow_promotion_codes=True,
            metadata=metadata,
        )
        return {"url": sess.url}
    except Exception as e:
        raise HTTPException(500, f"Stripe error: {e}")

@router.post("/webhook")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    try:
        evt = stripe.Webhook.construct_event(payload=payload, sig_header=sig, secret=STRIPE_WEBHOOK_SECRET)
    except Exception as e:
        raise HTTPException(400, f"Webhook signature verification failed: {e}")

    if evt["type"] == "checkout.session.completed":
        s = evt["data"]["object"]
        metadata = s.get("metadata") or {}
        plan = metadata.get("plan") or "starter"
        user_id = metadata.get("user_id")
        subject = metadata.get("subject") or None
        grade = metadata.get("grade") or None

        # 權限策略：
        # - starter：授予 (subject, grade)
        # - pro：授予 ALL_SUBJECTS / ALL_GRADES（你可在 entitlements 層解讀）
        if not user_id:
            return {"ok": True}

        expires_at = None   # 訂閱型可不設到期，或根據 invoice.period_end 來對齊
        scope = {"plan": plan, "subject": subject, "grade": grade}
        # 你專案已有 has_access/add_access；這裡只示意：
        add_access(user_id=user_id, scope=scope, expires_at=expires_at)

    return {"ok": True}
