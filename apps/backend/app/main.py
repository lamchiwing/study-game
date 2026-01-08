# apps/backend/app/main.py
from __future__ import annotations

import os
import io
import csv
import random
import re
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, UploadFile, File, Query, HTTPException
from fastapi.responses import JSONResponse, PlainTextResponse
from fastapi.middleware.cors import CORSMiddleware

from botocore.config import Config
import boto3

from app.routers.report import router as report_router
from app.billing_stripe import router as billing_router
from auth import auth_router

try:
    from app.entitlements import router as entitlements_router
except Exception:
    entitlements_router = None

app = FastAPI(title="Study Game API", version=os.getenv("APP_VERSION", "0.1.0"))

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

app.include_router(report_router, prefix="/api")
app.include_router(billing_router, prefix="/api")
app.include_router(auth_router, prefix="/api")
if entitlements_router:
    app.include_router(entitlements_router, prefix="/api")


@app.get("/", response_class=PlainTextResponse)
def root():
    return "study-game-back OK"


@app.get("/health")
def health():
    return {"status": "healthy"}


def _need(name: str) -> str:
    v = os.getenv(name)
    if not v:
        raise RuntimeError(f"Missing environment variable: {name}")
    return v


def _get_s3_client():
    # ✅ lazy init：避免一 import main.py 就因 env 未設 crash
    bucket = _need("S3_BUCKET")
    access = _need("S3_ACCESS_KEY")
    secret = _need("S3_SECRET_KEY")

    client = boto3.client(
        "s3",
        endpoint_url=os.getenv("S3_ENDPOINT") or None,
        aws_access_key_id=access,
        aws_secret_access_key=secret,
        region_name=os.getenv("S3_REGION", "auto"),
        config=Config(s3={"addressing_style": "path"}),
    )
    return client, bucket


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


@app.post("/api/upload")
async def upload_csv(slug: str, file: UploadFile = File(...)):
    slug = validate_slug(slug).replace(":", "/").replace("\\", "/").strip("/")
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="empty file")

    s3, bucket = _get_s3_client()
    key = f"packs/{slug}.csv"

    try:
        s3.put_object(Bucket=bucket, Key=key, Body=content, ContentType="text/csv")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"S3 put_object failed: {e}")

    return {"ok": True, "slug": slug, "key": key, "size": len(content)}


@app.get("/api/packs")
def list_packs():
    s3, bucket = _get_s3_client()
    items: List[Dict[str, Any]] = []
    kwargs = {"Bucket": bucket, "Prefix": PREFIX, "MaxKeys": 1000}
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
            items.append({"slug": slug, "title": title, "subject": subject, "grade": grade})
        if resp.get("IsTruncated") and resp.get("NextContinuationToken"):
            kwargs["ContinuationToken"] = resp["NextContinuationToken"]
        else:
            break
    return items


@app.get("/api/quiz")
def get_quiz(
    slug: str = Query(""),
    n: Optional[int] = Query(None),
    nmin: int = Query(10),
    nmax: int = Query(15),
    seed: Optional[str] = Query(None),
):
    slug = validate_slug(slug)
    s3, bucket = _get_s3_client()
    key = slug_to_key(slug)

    try:
        obj = s3.get_object(Bucket=bucket, Key=key)
    except Exception:
        return JSONResponse({"title": "", "list": [], "usedUrl": f"s3://{bucket}/{key}"})

    text = smart_decode(obj["Body"].read())
    rows = list(csv.DictReader(io.StringIO(text)))

    qs: List[Dict[str, Any]] = []
    for i, r in enumerate(rows, start=1):
        qs.append(
            {
                "id": r.get("id") or str(i),
                "question": r.get("question") or r.get("題目") or "",
                "choiceA": r.get("choiceA") or r.get("A") or "",
                "choiceB": r.get("choiceB") or r.get("B") or "",
                "choiceC": r.get("choiceC") or r.get("C") or "",
                "choiceD": r.get("choiceD") or r.get("D") or "",
                "answer": r.get("answer") or r.get("答案") or "",
                "explain": r.get("explain") or r.get("解析") or "",
            }
        )

    total = len(qs)
    rnd = random.Random(str(seed)) if seed else random
    if total and (n and n > 0):
        k = min(max(1, n), total)
    elif total:
        lo, hi = sorted([nmin, nmax])
        lo = max(1, lo)
        hi = max(lo, hi)
        k = min(rnd.randint(lo, hi), total)
    else:
        k = 0

    if total:
        qs_copy = qs[:]
        rnd.shuffle(qs_copy)
        qs = qs_copy[:k]

    return JSONResponse({"title": slug, "list": qs, "usedUrl": f"s3://{bucket}/{key}"})
