# apps/backend/app/main.py
import os, io, csv
from fastapi import FastAPI, UploadFile, File, Query, HTTPException
from fastapi.responses import JSONResponse, PlainTextResponse
from fastapi.middleware.cors import CORSMiddleware
import boto3
from botocore.config import Config

app = FastAPI()

# ---------- CORS ----------
allowlist = ["https://study-game-front.onrender.com", "http://localhost:5173"]
if os.getenv("FRONTEND_ORIGIN"):
    allowlist.append(os.getenv("FRONTEND_ORIGIN"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowlist,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=False,
    max_age=86400,
)

# ---------- S3/R2 ----------
S3_BUCKET = os.environ["S3_BUCKET"]
s3 = boto3.client(
    "s3",
    endpoint_url=os.getenv("S3_ENDPOINT") or None,
    aws_access_key_id=os.environ["S3_ACCESS_KEY"],
    aws_secret_access_key=os.environ["S3_SECRET_KEY"],
    region_name=os.getenv("S3_REGION", "auto"),
    config=Config(s3={"addressing_style": "virtual"}),
)
PREFIX = "packs/"
def slug_to_key(slug: str) -> str:
    return f"{PREFIX}{slug}.csv"

# ---------- helpers ----------
def smart_decode(b: bytes) -> str:
    # 嘗試常見編碼，避免「亂碼」
    for enc in ("utf-8-sig", "utf-8", "cp950", "big5", "gb18030"):
        try:
            return b.decode(enc)
        except Exception:
            continue
    return b.decode("utf-8", errors="replace")

# ---------- health ----------
@app.get("/", response_class=PlainTextResponse)
def root():
    return "study-game-back OK"

# ---------- upload CSV ----------
@app.post("/upload")
@app.post("/api/upload")
async def upload_csv(slug: str, file: UploadFile = File(...)):
    if not slug:
        raise HTTPException(status_code=400, detail="missing slug")
    content = await file.read()
    key = slug_to_key(slug)
    s3.put_object(Bucket=S3_BUCKET, Key=key, Body=content, ContentType="text/csv")
    return {"ok": True, "slug": slug, "key": key, "size": len(content)}

# ---------- list packs ----------
@app.get("/packs")
@app.get("/api/packs")
def list_packs():
    resp = s3.list_objects_v2(Bucket=S3_BUCKET, Prefix=PREFIX)
    items = []
    for obj in resp.get("Contents", []):
        key = obj["Key"]
        if not key.endswith(".csv"):
            continue
        slug = key[len(PREFIX):-4]
        parts = slug.split("/")
        title = parts[-1].replace("-", " ").title()
        subject = parts[0] if len(parts) > 0 else ""
        grade = parts[1] if len(parts) > 1 else ""
        items.append({"slug": slug, "title": title, "subject": subject, "grade": grade})
    return items

# ---------- get quiz ----------
@app.get("/quiz")
@app.get("/api/quiz")
def get_quiz(slug: str = Query("")):
    if not slug:
        return JSONResponse({"questions": []}, media_type="application/json; charset=utf-8")

    key = slug_to_key(slug)
    try:
        obj = s3.get_object(Bucket=S3_BUCKET, Key=key)
    except Exception:
        # 找不到檔案或權限問題 → 回空集合給前端顯示「No questions」
        return JSONResponse({"questions": []}, media_type="application/json; charset=utf-8")

    raw = obj["Body"].read()
    text = smart_decode(raw)

    rows = list(csv.DictReader(io.StringIO(text)))
    qs = []
    for i, r in enumerate(rows, start=1):
        qs.append({
            "id": r.get("id") or str(i),
            "question": r.get("question") or r.get("題目") or "",
            "choiceA": r.get("choiceA") or r.get("A") or "",
            "choiceB": r.get("choiceB") or r.get("B") or "",
            "choiceC": r.get("choiceC") or r.get("C") or "",
            "choiceD": r.get("choiceD") or r.get("D") or "",
            "answer":  r.get("answer") or r.get("答案") or "",
            "explain": r.get("explain") or r.get("解析") or "",
            "type":    r.get("type") or r.get("kind") or "",
            "pairs":   r.get("pairs") or "",
            "image":   r.get("image") or "",
        })

    return JSONResponse({"questions": qs}, media_type="application/json; charset=utf-8")
