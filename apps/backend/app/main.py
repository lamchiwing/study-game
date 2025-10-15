# apps/backend/app/main.py
import os, io, csv, random
from typing import Optional

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
    """嘗試常見編碼，避免亂碼"""
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
        slug = key[len(PREFIX):-4]  # 去掉 'packs/' 與 '.csv'
        parts = slug.split("/")
        title = parts[-1].replace("-", " ").title()
        subject = parts[0] if len(parts) > 0 else ""
        grade = parts[1] if len(parts) > 1 else ""
        items.append({"slug": slug, "title": title, "subject": subject, "grade": grade})
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
    回傳格式：
      {
        "list": [...],            # 題目陣列（可能已經隨機抽樣）
        "usedUrl": "s3://...csv",
        "debug": "rows=..., picked=..., seed=..."
      }
    查詢參數：
      - n:    精確抽幾題（>0 時優先）
      - nmin: 隨機下限（預設 10）
      - nmax: 隨機上限（預設 15）
      - seed: 決定性洗牌（同 seed 會得到同順序）
    """
    slug = (slug or "").strip()
    if not slug:
        return JSONResponse({"list": []}, media_type="application/json; charset=utf-8")

    key = slug_to_key(slug)
    try:
        obj = s3.get_object(Bucket=S3_BUCKET, Key=key)
    except Exception:
        # 找不到檔案或權限問題 → 回空集合給前端顯示「No questions」
        return JSONResponse(
            {"list": [], "usedUrl": f"s3://{S3_BUCKET}/{key}", "debug": "s3 get_object failed"},
            media_type="application/json; charset=utf-8",
        )

    raw = obj["Body"].read()
    text = smart_decode(raw)

    # 讀 CSV → rows (list[dict])
    rows = list(csv.DictReader(io.StringIO(text)))

    # 映射為前端可吃的欄位；pairs/left/right/answerMap 原樣透傳
    qs = []
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
            "answers":  r.get("answers") or "",   # fill 題 pipe：yellow|黃色
            "explain":  r.get("explain") or r.get("解析") or "",
            "image":    r.get("image") or "",

            # --- 配對題欄位（交給前端 normalizeOne 的容錯解析）---
            "pairs":     r.get("pairs") or r.get("Pairs") or "",
            "left":      r.get("left") or r.get("Left") or "",
            "right":     r.get("right") or r.get("Right") or "",
            "answerMap": r.get("answerMap") or r.get("map") or r.get("index") or "",
        })

    total = len(qs)
    picked = total

    # ---- 隨機抽題邏輯 ----
    rnd = random.Random(str(seed)) if seed else random  # 決定性或一般亂數

    # 決定抽幾題
    if isinstance(n, int) and n > 0:
        k = min(max(1, n), total) if total > 0 else 0
    else:
        # 防呆：確保 lo <= hi 且都 ≥ 1（當 total>0）
        lo = 1 if total > 0 else 0
        lo = max(lo, min(nmin, nmax))
        hi = max(lo, nmax) if total > 0 else 0
        k = rnd.randint(lo, hi) if total > 0 else 0
        k = min(k, total)

    # 只有題庫非空才洗牌/抽樣
    if total > 0 and k > 0:
        qs_copy = qs[:]       # 不改動原列表
        rnd.shuffle(qs_copy)  # 可能是決定性 shuffle
        qs = qs_copy[:k]
        picked = len(qs)
    else:
        qs = []

    debug_msg = f"rows={total}, picked={picked}" + (f", seed={seed}" if seed else "")

    return JSONResponse(
        {"list": qs, "usedUrl": f"s3://{S3_BUCKET}/{key}", "debug": debug_msg},
        media_type="application/json; charset=utf-8",
    )

# apps/backend/app/main.py（擷取：加入一個路由）
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, EmailStr
from .mailer_sendgrid import send_report_email

class ReportPayload(BaseModel):
    to_email: EmailStr
    student_name: str
    grade: str | None = None
    score: int
    total: int
    duration_min: int | None = None
    summary: str | None = None
    detail_rows: list[dict] | None = None  # 可放 {q, yourAns, correctAns}

@app.post("/report/send")
def send_report(payload: ReportPayload):
    subject = f"{payload.student_name} 今日練習報告：{payload.score}/{payload.total}"
    # 簡單 HTML（你可改為更漂亮的樣式）
    rows_html = ""
    if payload.detail_rows:
        rows_html = "<table style='width:100%;border-collapse:collapse;font-size:14px'>"
        rows_html += "<tr><th align='left'>題目</th><th align='left'>你的答案</th><th align='left'>正確答案</th></tr>"
        for r in payload.detail_rows[:50]:
            q = r.get("q","")
            a = r.get("yourAns","")
            c = r.get("correct","")
            rows_html += f"<tr><td style='border-top:1px solid #eee;padding:6px 4px'>{q}</td>"
            rows_html += f"<td style='border-top:1px solid #eee;padding:6px 4px'>{a}</td>"
            rows_html += f"<td style='border-top:1px solid #eee;padding:6px 4px'>{c}</td></tr>"
        rows_html += "</table>"

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
        raise HTTPException(status_code=500, detail=err)
    return {"ok": True}
