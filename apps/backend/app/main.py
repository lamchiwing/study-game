# apps/backend/app/main.py （只示範路由與 S3 客戶端，若你已有就合併）
import os, io, csv
from fastapi import FastAPI, UploadFile, File, Query
from fastapi.responses import PlainTextResponse
from fastapi.middleware.cors import CORSMiddleware
import boto3
from botocore.config import Config

app = FastAPI()

# CORS（依你的前端網域調整）
allowlist = ["https://study-game-front.onrender.com", "http://localhost:5173"]
if os.getenv("FRONTEND_ORIGIN"):
    allowlist.append(os.getenv("FRONTEND_ORIGIN"))
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowlist, allow_methods=["*"], allow_headers=["*"], max_age=86400
)

# S3/R2
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
def slug_to_key(slug: str) -> str: return f"{PREFIX}{slug}.csv"

@app.get("/", response_class=PlainTextResponse)
def root(): return "study-game-back OK"

# ⬇⬇⬇ 這兩條就是你缺的上傳 API（/upload 與 /api/upload） ⬇⬇⬇
@app.post("/upload")
@app.post("/api/upload")
async def upload_csv(slug: str, file: UploadFile = File(...)):
    key = slug_to_key(slug)
    content = await file.read()
    s3.put_object(Bucket=S3_BUCKET, Key=key, Body=content, ContentType="text/csv")
    return {"ok": True, "slug": slug, "key": key, "size": len(content)}

# （可選）列題包與取題目，之後前端會用到
@app.get("/packs")
@app.get("/api/packs")
def list_packs():
    resp = s3.list_objects_v2(Bucket=S3_BUCKET, Prefix=PREFIX)
    items = []
    for obj in resp.get("Contents", []):
        key = obj["Key"]
        if key.endswith(".csv"):
            slug = key[len(PREFIX):-4]
            title = slug.split("/")[-1].replace("-", " ").title()
            subject = slug.split("/")[0]
            grade = slug.split("/")[1] if len(slug.split("/")) > 1 else ""
            items.append({"slug": slug, "title": title, "subject": subject, "grade": grade})
    return items

@app.get("/quiz")
@app.get("/api/quiz")
def get_quiz(slug: str = Query("")):
    if not slug: return {"questions": []}
    try:
        obj = s3.get_object(Bucket=S3_BUCKET, Key=slug_to_key(slug))
    except Exception:
        return {"questions": []}
    text = obj["Body"].read().decode("utf-8-sig")
    rows = list(csv.DictReader(io.StringIO(text)))
    # 最小正規化，前端會吃 choiceA..D / answer / explain
    qs = [{
        "id": r.get("id") or str(i+1),
        "question": r.get("question") or "",
        "choiceA": r.get("choiceA") or "",
        "choiceB": r.get("choiceB") or "",
        "choiceC": r.get("choiceC") or "",
        "choiceD": r.get("choiceD") or "",
        "answer":  r.get("answer") or "",
        "explain": r.get("explain") or "",
        "type":    r.get("type") or "",
        "pairs":   r.get("pairs") or "",
        "image":   r.get("image") or "",
    } for i, r in enumerate(rows)]
    return {"questions": qs}
