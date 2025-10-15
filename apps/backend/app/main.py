# apps/backend/app/main.py
import os, io, csv, random, re
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, UploadFile, File, Query, HTTPException
from fastapi.responses import JSONResponse, PlainTextResponse
from fastapi.middleware.cors import CORSMiddleware

import boto3
from botocore.config import Config
from pydantic import BaseModel, EmailStr

# ----- app -----
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

# ---------- env & S3/R2 ----------
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
    """Only allow simple path fragments like 'math/p1/add-10'."""
    slug = (slug or "").strip().strip("/")
    if not slug or ".." in slug or not _slug_re.fullmatch(slug):
        raise HTTPException(status_code=400, detail="invalid slug")
    return slug

def slug_to_key(slug: str) -> str:
    return f"{PREFIX}{slug}.csv"

# ---------- helpers ----------
def smart_decode(b: bytes) -> str:
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

# ---------- list packs (with pagination) ----------
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
            slug = key[len(PREFIX):-4]  # drop 'packs/' and '.csv'
            parts = slug.split("/")
            title = parts[-1].replace("-", " ").title()
            subject = parts[0] if len(parts) > 0 else ""
            grade = parts[1] if len(parts) > 1 else ""
            items.append({"slug": slug, "title": title, "subject": subject, "grade": grade})

        if resp.get("IsTruncated") and resp.get("NextContinuationToken"):
            kwargs["ContinuationToken"] = resp["NextContinuationToken"]
        else:
            break

    return items

# ---------- get quiz ----------
@app.get("/quiz")
@app.get("/api/quiz")
def get_quiz(
    slug: str = Query(""),
    n: Optional[int] = Query(None, description="精確抽幾題；若給 n，忽略 nmin/nmax"),
    nmin: int = Query(10, description="隨機下限（含）"),
    nmax: int = Query(15, description="隨機上限（含）"),
    seed: Optional[str] = Query(None, description="決定性洗牌種子（如 '2025-10-08' 或 'user123'）"),
):
    """
    回傳：
      {"list":[...], "usedUrl":"s3://bucket/key.csv", "debug":"rows=.., picked=.., seed=.."}
    """
    try:
        slug = validate_slug(slug)
    except HTTPException:
        return JSONResponse({"list": []}, media_type="application/json; charset=utf-8")

    key = slug_to_key(slug)
    try:
        obj = s3.get_object(Bucket=S3_BUCKET, Key=key)
    except Exception:
        return JSONResponse(
            {"list": [], "usedUrl": f"s3://{S3_BUCKET}/{key}", "debug": "s3 get_object failed"},
            media_type="application/json; charset=utf-8",
        )

    raw = obj["Body"].read()
    text = smart_decode(raw)
    rows = list(csv.DictReader(io.StringIO(text)))

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
        {"list": qs, "usedUrl": f"s3://{S3_BUCKET}/{key}", "debug": debug_msg},
        media_type="application/json; charset=utf-8",
    )

# ---------- email report ----------
from .mailer_sendgrid import send_report_email  # keep local helper

class ReportPayload(BaseModel):
    to_email: EmailStr
    student_name: str
    grade: Optional[str] = None
    score: int
    total: int
    duration_min: Optional[int] = None
    summary: Optional[str] = None
    detail_rows: Optional[List[Dict[str, Any]]] = None  # {q, yourAns, correct}

@app.post("/report/send")
def send_report(payload: ReportPayload):
    subject = f"{payload.student_name} 今日練習報告：{payload.score}/{payload.total}"

    rows_html = ""
    if payload.detail_rows:
        rows_html = [
            "<table style='width:100%;border-collapse:collapse;font-size:14px'>",
            "<tr><th align='left'>題目</th><th align='left'>你的答案</th><th align='left'>正確答案</th></tr>",
        ]
        for r in payload.detail_rows[:50]:
            q = (r.get("q") or "").replace("<","&lt;").replace(">","&gt;")
            a = (r.get("yourAns") or "")
            c = (r.get("correct") or "")
            rows_html.append(
                "<tr>"
                f"<td style='border-top:1px solid #eee;padding:6px 4px'>{q}</td>"
                f"<td style='border-top:1px solid #eee;padding:6px 4px'>{a}</td>"
                f"<td style='border-top:1px solid #eee;padding:6px 4px'>{c}</td>"
                "</tr>"
            )
        rows_html.append("</table>")
        rows_html = "".join(rows_html)

    html = f"""
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif">
      <h2 style="margin:0 0 8px">學習報告</h2>
      <div>學生：<b>{payload.student_name}</b>{' · 年級：'+payload.grade if payload.grade else ''}</div>
      <div>分數：<b>{payload.score}/{payload.total}</b>{' · 用時：'+str(payload.duration_min)+' 分' if payload.duration_min else ''}</div>
      {'<p style="margin-top:8px">'+payload.summary+'</p>' if payload.summary else ''}
      {rows_html}
      <p style="color:#666;font-size:12px;margin-top:16px">
        本電郵由系統自動發送。若有疑問，直接回覆本郵件即可。
      </p>
    </div>
    """

    ok, err = send_report_email(payload.to_email, subject, html)
    if not ok:
        raise HTTPException(status_code=502, detail=err)
    return {"ok": True}
