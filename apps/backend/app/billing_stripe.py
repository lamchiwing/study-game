# apps/backend/app/billing_stripe.py
from __future__ import annotations
import os
from typing import Optional, Dict, Any

import stripe
from fastapi import APIRouter, HTTPException, Header, Request
from pydantic import BaseModel

from .entitlements import add_access, upsert_customer

router = APIRouter(prefix="/billing", tags=["billing"])

STRIPE_SECRET_KEY     = os.getenv("STRIPE_SECRET_KEY")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET")

STRIPE_PRICE_STARTER  = os.getenv("STRIPE_PRICE_STARTER")
STRIPE_PRICE_PRO      = os.getenv("STRIPE_PRICE_PRO")

if STRIPE_SECRET_KEY:
    stripe.api_key = STRIPE_SECRET_KEY

PRICE_TO_PLAN: Dict[Optional[str], str] = {
    STRIPE_PRICE_STARTER: "starter",
    STRIPE_PRICE_PRO: "pro",
}

class CheckoutBody(BaseModel):
    plan: str
    subject: Optional[str] = None
    grade: Optional[str] = None
    subjects_csv: Optional[str] = None
    grades_csv: Optional[str] = None
    success_url: str
    cancel_url: str

def _ensure_stripe_ready(plan: str):
    if not STRIPE_SECRET_KEY:
        raise HTTPException(500, "Missing STRIPE_SECRET_KEY")
    p = (plan or "").strip().lower()
    if p == "starter" and not STRIPE_PRICE_STARTER:
        raise HTTPException(500, "Missing STRIPE_PRICE_STARTER")
    if p == "pro" and not STRIPE_PRICE_PRO:
        raise HTTPException(500, "Missing STRIPE_PRICE_PRO")
    if p not in ("starter", "pro"):
        raise HTTPException(400, f"Unsupported plan: {plan}")

def _pick_price(plan: str) -> str:
    p = (plan or "").strip().lower()
    if p == "starter" and STRIPE_PRICE_STARTER:
        return STRIPE_PRICE_STARTER
    if p == "pro" and STRIPE_PRICE_PRO:
        return STRIPE_PRICE_PRO
    raise HTTPException(400, "Price not configured")

@router.post("/checkout")
def create_checkout_session(
    body: CheckoutBody,
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
):
    plan = (body.plan or "starter").lower()
    _ensure_stripe_ready(plan)

    user_id = x_user_id or ""
    if not user_id:
        import uuid
        user_id = f"anon_{uuid.uuid4()}"

    price_id = _pick_price(plan)

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

@router.post("/webhook")
async def stripe_webhook(request: Request):
    if not STRIPE_WEBHOOK_SECRET:
        raise HTTPException(500, "Missing STRIPE_WEBHOOK_SECRET")

    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")

    try:
        evt = stripe.Webhook.construct_event(
            payload=payload,
            sig_header=sig,
            secret=STRIPE_WEBHOOK_SECRET
        )
    except Exception as e:
        raise HTTPException(400, f"Webhook verification failed: {e}")

    etype = evt.get("type")
    data  = evt["data"]["object"]

    if etype == "checkout.session.completed":
        md  = (data.get("metadata") or {})
        uid = data.get("client_reference_id") or md.get("user_id")
        plan = (md.get("plan") or "").strip().lower()

        # email
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

    return {"ok": True}
