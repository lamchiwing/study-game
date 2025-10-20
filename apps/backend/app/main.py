# apps/backend/app/main.py
import os, io, csv, random, re
from typing import Optional, List, Dict, Any

from fastapi import Header, FastAPI, UploadFile, File, Query, HTTPException
from fastapi.responses import JSONResponse, PlainTextResponse
from fastapi.middleware.cors import CORSMiddleware
from .entitlements import has_access, get_user_profile  # 你專案已內建
from .mailer_sendgrid import send_report_email

import boto3
from botocore.config import Config
from pydantic import BaseModel, EmailStr
from app.mailer_sendgrid import send_report_email  # 僅保留這一行


REPORT_PAID_ONLY = os.getenv("REPORT_PAID_ONLY", "1") == "1"
EMAIL_RX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# 如果你的 Pydantic model 還是強制 to_email，改成可選
class ReportPayload(BaseModel):
    to_email: Optional[str] = None          # ← 由必填改成可選
    student_name: Optional[str] = None
    grade: Optional[str] = None
    score: int
    total: int
    duration_min: Optional[int] = None
    summary: Optional[str] = None
    detail_rows: Optional[list[dict]] = None

def _parse_subject_grade(slug: str) -> tuple[str, int]:
    """
    "math/grade1/20m" -> ("math", 1)
    "math/Grade02/setA" -> ("math", 2)
    "chinese/g1/pack" -> ("chinese", 1)  # 若你將來改寫成 g1 也能支援
    """
    # e.g. "math/grade1/20m" -> ("math", 1)
    slug = (slug or "").strip().lower()
    parts = slug.split("/") if slug else []
    subject = parts[0] if parts else ""

     # 抓 grade 數字（gradeXX 或 gXX 都接受）
    m = re.search(r"(?:grade|g)\s*(\d+)", slug)
    grade = int(m.group(1)) if m else 0
    return subject, grade



# ----- 先建立 app，再宣告任何路由 -----
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

# --- 測試寄信路由（GET）---
@app.get("/__test_mail")
def __test_mail(to: EmailStr):
    ok, err = send_report_email(
        to=str(to),  # 修正參數名稱：to=，不是 to_email=
        subject="[Study Game] 測試信件",
        html="<p>這是一封測試信件，如果你收到了，代表 SendGrid 設定OK。</p>"
    )
    return {"ok": ok, "error": err}

# 其後保持你的既有程式（need(...)、S3 客戶端、/packs、/quiz、/report/send 等）


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
        {"title": pack_title, "list": qs, "usedUrl": f"s3://{S3_BUCKET}/{key}", "debug": debug_msg},
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
def send_report(
    payload: ReportPayload,
    slug: str | None = Query(default=None),                 # 前端帶上目前測驗的 slug
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
):
    # 1) 權限：若開啟限制，未購買則拒絕
    if REPORT_PAID_ONLY:
        subject_code, grade = _parse_subject_grade(slug or "")
        if not has_access(x_user_id, subject_code, grade):
            raise HTTPException(status_code=402, detail="報告功能需購買方案")

    # 2) 參數檢查
    to_email = (payload.to_email or "").strip()
    if not to_email or not EMAIL_RX.match(to_email):
        raise HTTPException(status_code=400, detail="收件電郵格式不正確")

    student_name = (payload.student_name or "").strip()
    sc = max(0, int(payload.score or 0))
    tt = max(0, int(payload.total or 0))
    subject_line = f"{student_name or '學生'} 今日練習報告：{sc}/{tt}"

    # 3) 安全轉義（避免把前端 HTML 直接塞進信件）
    def esc(s: str | None) -> str:
        return html.escape(str(s or ""), quote=True)

    rows_html = ""
    if payload.detail_rows:
        rows_html_parts = [
            "<table style='width:100%;border-collapse:collapse;font-size:14px'>",
            "<tr><th align='left'>題目</th><th align='left'>你的答案</th><th align='left'>正確答案</th></tr>",
        ]
        for r in (payload.detail_rows or [])[:50]:  # 上限 50 筆
            q = esc(r.get("q"))
            a = esc(r.get("yourAns"))
            c = esc(r.get("correct"))
            rows_html_parts.append(
                "<tr>"
                f"<td style='border-top:1px solid #eee;padding:6px 4px'>{q}</td>"
                f"<td style='border-top:1px solid #eee;padding:6px 4px'>{a}</td>"
                f"<td style='border-top:1px solid #eee;padding:6px 4px'>{c}</td>"
                "</tr>"
            )
        rows_html_parts.append("</table>")
        rows_html = "".join(rows_html_parts)

    # 4) 內文
    summary_html = ""
    if payload.summary:
        # 支援簡單換行；仍然全部轉義避免 XSS
        summary_html = f"<p style='margin-top:8px'>{esc(payload.summary).replace('\\n','<br>')}</p>"

    duration = f" · 用時：{int(payload.duration_min)} 分" if payload.duration_min else ""

    html_body = f"""
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif">
      <h2 style="margin:0 0 8px">學習報告</h2>
      <div>學生：<b>{esc(student_name)}</b>{' · 年級：'+esc(payload.grade) if payload.grade else ''}</div>
      <div>分數：<b>{sc}/{tt}</b>{duration}</div>
      {summary_html}
      {rows_html}
      <p style="color:#666;font-size:12px;margin-top:16px">
        本電郵由系統自動發送。若有疑問，直接回覆本郵件即可。
      </p>
    </div>
    """.strip()

    ok, err = send_report_email(to_email, subject_line, html_body)
    if not ok:
        # 轉拋 SendGrid 失敗訊息
        raise HTTPException(status_code=502, detail=f"寄送失敗：{err}")
    return {"ok": True}
