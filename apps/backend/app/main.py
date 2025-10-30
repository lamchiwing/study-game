# apps/backend/app/main.py
from __future__ import annotations

import os
import io
import csv
import random
import re
import stripe
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, UploadFile, File, Query, HTTPException
from fastapi.responses import JSONResponse, PlainTextResponse
from fastapi.middleware.cors import CORSMiddleware
# apps/backend/app/main.py
from fastapi import Header
from .billing_stripe import router as billing_router
app.include_router(billing_router)

import boto3
from botocore.config import Config

# =========================
# App & CORS
# =========================
app = FastAPI(
    title="Study Game API",
    version=os.getenv("APP_VERSION", "0.1.0"),
)

# ---- ENV ----
STRIPE_SECRET_KEY    = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")

# ✅ 情況 A：FRONTEND fallback（這三選一）
FRONTEND = os.getenv("FRONTEND_URL") or os.getenv("FRONTEND_ORIGIN") or "http://localhost:5173"

if STRIPE_SECRET_KEY:
    stripe.api_key = STRIPE_SECRET_KEY


# 以環境變數設定多個允許來源，逗號分隔
# 例：CORS_ALLOW_ORIGINS="https://study-game-front.onrender.com,https://mypenisblue.com,https://www.mypenisblue.com"

def to_origin(u: str) -> str:
    m = re.match(r'^(https?://[^/]+)', (u or '').strip())
    return (m.group(1) if m else u).rstrip('/')

ALLOWED = [to_origin(o) for o in os.getenv("CORS_ALLOW_ORIGINS","").split(",") if o.strip()]
allow_all = (len(ALLOWED) == 0)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if allow_all else ALLOWED,
    allow_credentials=not allow_all,
    allow_methods=["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
    allow_headers=["Content-Type","Authorization","X-Requested-With","X-User-Id"],
    max_age=86400,
)

@app.post("/api/billing/checkout")
async def billing_checkout(
    payload: dict,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
):
    # 1) 取得 user_id（沒有就自動產生匿名）
    user_id = x_user_id or payload.get("user_id")
    if not user_id:
        import uuid
        user_id = f"anon_{uuid.uuid4()}"

    # 2) 解析前端傳來的 plan / urls
    plan = (payload.get("plan") or "starter").lower()
    success_url = payload.get("success_url") or f"{FRONTEND}/pricing"
    cancel_url  = payload.get("cancel_url")  or f"{FRONTEND}/pricing"

    # 3) 對應 Stripe Price（用環境變數）
    price_ids = {
        "starter": os.getenv("STRIPE_PRICE_STARTER"),
        "pro":     os.getenv("STRIPE_PRICE_PRO"),
    }
    price_id = price_ids.get(plan) or price_ids["starter"]
    if not price_id:
        raise HTTPException(status_code=500, detail="Stripe price not configured")

    if not STRIPE_SECRET_KEY:
        raise HTTPException(status_code=500, detail="Stripe not configured")

    try:
        # 4) 建立 Checkout Session（訂閱範例；一次性付款請改 mode="payment"）
        session = stripe.checkout.Session.create(
            mode="subscription",
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=success_url,
            cancel_url=cancel_url,
            client_reference_id=user_id,  # 用來在 webhook 對回你的使用者
            # 可選：讓 Stripe 自動建立/關聯 customer
            # customer_email=payload.get("email") or None,
            # subscription_data={"metadata": {"plan": plan, "uid": user_id}},
            allow_promotion_codes=True,
        )
        # 5) 回傳 url（前端直接跳轉）
        return {"id": session.id, "url": session.url}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Create session failed: {e}")


# =========================
# Health / Version
# =========================
@app.get("/", response_class=PlainTextResponse)
def root():
    return "study-game-back OK"

@app.get("/health")
def health():
    return {"status": "healthy"}

@app.get("/version")
def version():
    return {"version": os.getenv("APP_VERSION", "0.1.0")}

# =========================
# Include Routers
#   - /report/* 由 app/routers/report.py 處理
#   - /api/billing/* 由 app/billing_stripe.py 處理
# =========================
try:
    from .routers.report import router as report_router
    app.include_router(report_router)
except Exception as e:
    print("[WARN] fail to include routers.report:", e)

try:
    from .billing_stripe import router as billing_router
    app.include_router(billing_router)
except Exception as e:
    print("[WARN] fail to include billing_stripe:", e)

try:
    from .entitlement_api import router as ent_api
    app.include_router(ent_api)
except Exception as e:
    print("[WARN] fail to include entitlement_api:", e)

try:
    from .routers.entitlement_api import router as ent_api
    app.include_router(ent_api)
except Exception as e:
    print("[WARN] fail to include entitlement_api:", e)



# =========================
# S3 – packs / quiz / upload
# =========================
def need(name: str) -> str:
    v = os.getenv(name)
    if not v:
        raise RuntimeError(f"Missing environment variable: {name}")
    return v

S3_BUCKET = need("S3_BUCKET")
S3_ACCESS_KEY = need("S3_ACCESS_KEY")
S3_SECRET_KEY = need("S3_SECRET_KEY")

s3 = boto3.client(
    "s3",
    endpoint_url=os.getenv("S3_ENDPOINT") or None,
    aws_access_key_id=S3_ACCESS_KEY,
    aws_secret_access_key=S3_SECRET_KEY,
    region_name=os.getenv("S3_REGION", "auto"),
    config=Config(s3={"addressing_style": "virtual"}),
)

PREFIX = "packs/"
_slug_re = re.compile(r"^[a-z0-9/_-]+$", re.I)

def validate_slug(slug: str) -> str:
    slug = (slug or "").strip().strip("/")
    if not slug or ".." in slug or not _slug_re.fullmatch(slug):
        raise HTTPException(status_code=400, detail="invalid slug")
    return slug

def slug_to_key(slug: str) -> str:
    return f"{PREFIX}{slug}.csv"

def smart_decode(b: bytes) -> str:
    for enc in ("utf-8-sig", "utf-8", "cp950", "big5", "gb18030"):
        try:
            return b.decode(enc)
        except Exception:
            continue
    return b.decode("utf-8", errors="replace")

@app.post("/upload")
@app.post("/api/upload")
async def upload_csv(slug: str, file: UploadFile = File(...)):
    slug = validate_slug(slug)
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="empty file")
    key = slug_to_key(slug)
    try:
        s3.put_object(Bucket=S3_BUCKET, Key=key, Body=content, ContentType="text/csv")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"S3 put_object failed: {e}")
    return {"ok": True, "slug": slug, "key": key, "size": len(content)}

@app.get("/packs")
@app.get("/api/packs")
def list_packs():
    items: List[Dict[str, Any]] = []
    kwargs = {"Bucket": S3_BUCKET, "Prefix": PREFIX, "MaxKeys": 1000}
    while True:
        resp = s3.list_objects_v2(**kwargs)
        for obj in resp.get("Contents", []):
            key = obj["Key"]
            if not key.endswith(".csv"):
                continue
            slug = key[len(PREFIX):-4]
            parts = slug.split("/")
            title = parts[-1].replace("-", " ").title() if parts else slug
            subject = parts[0] if len(parts) > 0 else ""
            grade = parts[1] if len(parts) > 1 else ""
            items.append({"slug": slug, "title": title, "subject": subject, "grade": grade})
        if resp.get("IsTruncated") and resp.get("NextContinuationToken"):
            kwargs["ContinuationToken"] = resp["NextContinuationToken"]
        else:
            break
    return items

@app.get("/quiz")
@app.get("/api/quiz")
def get_quiz(
    slug: str = Query(""),
    n: Optional[int] = Query(None),
    nmin: int = Query(10),
    nmax: int = Query(15),
    seed: Optional[str] = Query(None),
):
    try:
        slug = validate_slug(slug)
    except HTTPException:
        return JSONResponse({"title": "", "list": []}, media_type="application/json; charset=utf-8")

    key = slug_to_key(slug)
    try:
        obj = s3.get_object(Bucket=S3_BUCKET, Key=key)
    except Exception:
        return JSONResponse(
            {"title": "", "list": [], "usedUrl": f"s3://{S3_BUCKET}/{key}", "debug": "s3 get_object failed"},
            media_type="application/json; charset=utf-8",
        )

    raw = obj["Body"].read()
    text = smart_decode(raw)
    rows = list(csv.DictReader(io.StringIO(text)))

    pack_title = ""
    for r in rows:
        t = (r.get("title") or r.get("標題") or "").strip()
        if t:
            pack_title = t
            break

    qs: List[Dict[str, Any]] = []
    for i, r in enumerate(rows, start=1):
        qs.append({
            "id":       r.get("id") or str(i),
            "type":     r.get("type") or r.get("kind") or "",
            "question": r.get("question") or r.get("題目") or "",
            "choiceA":  r.get("choiceA") or r.get("A") or "",
            "choiceB":  r.get("choiceB") or r.get("B") or "",
            "choiceC":  r.get("choiceC") or r.get("C") or "",
            "choiceD":  r.get("choiceD") or r.get("D") or "",
            "answer":   r.get("answer")  or r.get("答案") or "",
            "answers":  r.get("answers") or "",
            "explain":  r.get("explain") or r.get("解析") or "",
            "image":    r.get("image") or "",
            "pairs":     r.get("pairs") or r.get("Pairs") or "",
            "left":      r.get("left") or r.get("Left") or "",
            "right":     r.get("right") or r.get("Right") or "",
            "answerMap": r.get("answerMap") or r.get("map") or r.get("index") or "",
        })

    total = len(qs)
    picked = 0
    if total > 0:
        rnd = random.Random(str(seed)) if seed else random
        if n and n > 0:
            k = min(max(1, n), total)
        else:
            lo, hi = sorted([nmin, nmax])
            lo = max(1, lo); hi = max(lo, hi)
            k = min(rnd.randint(lo, hi), total)
        qs_copy = qs[:]; rnd.shuffle(qs_copy); qs = qs_copy[:k]; picked = len(qs)
    else:
        qs = []

    debug_msg = f"rows={total}, picked={picked}" + (f", seed={seed}" if seed else "")
    return JSONResponse(
        {"title": pack_title, "list": qs, "usedUrl": f"s3://{S3_BUCKET}/{key}", "debug": debug_msg},
        media_type="application/json; charset=utf-8",
    )
