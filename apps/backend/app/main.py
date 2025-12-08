# apps/backend/app/main.py
from __future__ import annotations

import os
import io
import csv
import random
import re
from typing import Optional, List, Dict, Any

import boto3
from botocore.config import Config
from fastapi import FastAPI, UploadFile, File, Query, HTTPException
from fastapi.responses import JSONResponse, PlainTextResponse
from fastapi.middleware.cors import CORSMiddleware

from .routers.report import router as report_router
from .billing_stripe import router as billing_router

# ✅ 從 sibling package "auth" import
from auth import auth_router

try:
  from .entitlements import router as entitlements_router
except Exception:
  entitlements_router = None


app = FastAPI(
  title="Study Game API",
  version=os.getenv("APP_VERSION", "0.1.0"),
)

app.add_middleware(
  CORSMiddleware,
  allow_origins=[
    "https://mypenisblue.com",
    "https://www.mypenisblue.com",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ],
  allow_credentials=True,
  allow_methods=["*"],
  allow_headers=["*"],
)

# 👇 統一用 /api prefix
app.include_router(report_router, prefix="/api")
app.include_router(billing_router, prefix="/api")
app.include_router(auth_router, prefix="/api")

if entitlements_router :
  app.include_router(entitlements_router, prefix="/api")


# =========================================================
# Health / Version
# =========================================================
@app.get("/", response_class=PlainTextResponse)
def root():
    return "study-game-back OK"


@app.get("/health")
def health():
    return {"status": "healthy"}


@app.get("/version")
def version():
    return {"version": os.getenv("APP_VERSION", "0.1.0")}


# =========================================================
# S3: packs / quiz / upload
# =========================================================
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
    config=Config(s3={"addressing_style": "path"}),
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


# =========================================================
# Upload / Packs / Quiz Endpoints
# =========================================================
@app.post("/upload")
@app.post("/api/upload")
async def upload_csv(slug: str, file: UploadFile = File(...)):
    # 1️⃣ 驗證 slug，只允許 a-z0-9 / _ -
    slug = validate_slug(slug)

    # 2️⃣ 修正符號：確保不會誤被 : 取代
    slug = slug.replace(":", "/").replace("\\", "/").strip("/")

    # 3️⃣ 讀取檔案內容
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="empty file")

    # 4️⃣ 生成 key（維持有 / 的階層）
    key = f"packs/{slug}.csv"

    # 5️⃣ 上傳 S3 / R2
    try:
        s3.put_object(
            Bucket=S3_BUCKET,
            Key=key,
            Body=content,
            ContentType="text/csv",
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"S3 put_object failed: {e}")

    # 6️⃣ 回傳實際 key
    return {
        "ok": True,
        "slug": slug,
        "key": key,
        "url": f"https://{S3_BUCKET}.r2.cloudflarestorage.com/{key}",
        "size": len(content),
    }


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
            slug = key[len(PREFIX) : -4]
            parts = slug.split("/")
            title = parts[-1].replace("-", " ").title() if parts else slug
            subject = parts[0] if len(parts) > 0 else ""
            grade = parts[1] if len(parts) > 1 else ""
            items.append(
                {
                    "slug": slug,
                    "title": title,
                    "subject": subject,
                    "grade": grade,
                }
            )
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
        return JSONResponse(
            {"title": "", "list": []},
            media_type="application/json; charset=utf-8",
        )

    key = slug_to_key(slug)
    try:
        obj = s3.get_object(Bucket=S3_BUCKET, Key=key)
    except Exception:
        return JSONResponse(
            {
                "title": "",
                "list": [],
                "usedUrl": f"s3://{S3_BUCKET}/{key}",
                "debug": "s3 get_object failed",
            },
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
        qs.append(
            {
                "id": r.get("id") or str(i),
                "type": r.get("type") or r.get("kind") or "",
                "question": r.get("question") or r.get("題目") or "",
                "choiceA": r.get("choiceA") or r.get("A") or "",
                "choiceB": r.get("choiceB") or r.get("B") or "",
                "choiceC": r.get("choiceC") or r.get("C") or "",
                "choiceD": r.get("choiceD") or r.get("D") or "",
                "answer": r.get("answer") or r.get("答案") or "",
                "answers": r.get("answers") or "",
                "explain": r.get("explain") or r.get("解析") or "",
                "image": r.get("image") or "",
                "pairs": r.get("pairs") or r.get("Pairs") or "",
                "left": r.get("left") or r.get("Left") or "",
                "right": r.get("right") or r.get("Right") or "",
                "answerMap": r.get("answerMap")
                or r.get("map")
                or r.get("index")
                or "",
            }
        )

    total = len(qs)
    picked = 0
    if total > 0:
        rnd = random.Random(str(seed)) if seed else random
        if n and n > 0:
            k = min(max(1, n), total)
        else:
            lo, hi = sorted([nmin, nmax])
            lo = max(1, lo)
            hi = max(lo, hi)
            k = min(rnd.randint(lo, hi), total)
        qs_copy = qs[:]
        rnd.shuffle(qs_copy)
        qs = qs_copy[:k]
        picked = len(qs)
    else:
        qs = []

    debug_msg = f"rows={total}, picked={picked}" + (f", seed={seed}" if seed else "")
    return JSONResponse(
        {
            "title": pack_title,
            "list": qs,
            "usedUrl": f"s3://{S3_BUCKET}/{key}",
            "debug": debug_msg,
        },
        media_type="application/json; charset=utf-8",
    )
