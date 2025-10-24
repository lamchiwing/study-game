# apps/backend/app/main.py
import os, io, csv, random, re, html
from typing import Optional, List, Dict, Any, Tuple

from fastapi import Header, FastAPI, UploadFile, File, Query, HTTPException
from fastapi.responses import JSONResponse, PlainTextResponse
from fastapi.middleware.cors import CORSMiddleware
# app/main.py（片段）
from .billing_stripe import router as billing_router
app.include_router(billing_router)
# apps/backend/app/main.py 片段
from .routes_report import router as report_router
app.include_router(report_router)

# apps/backend/app/main.py
from __future__ import annotations
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse

app = FastAPI(
    title="Study Game API",
    version=os.getenv("APP_VERSION", "0.1.0"),
)

# 先建立 app，再掛中介與路由（很重要！）
ALLOWED = [o.strip() for o in os.getenv("CORS_ALLOW_ORIGINS", "*").split(",") if o.strip()]
allow_all = (len(ALLOWED) == 0)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if allow_all else ALLOWED,
    allow_credentials=not allow_all,  # 若用 * 建議關閉 credentials
    allow_methods=["*"],
    allow_headers=["Content-Type", "Authorization", "X-Requested-With", "X-User-Id"],
    max_age=86400,
)

@app.get("/", response_class=PlainTextResponse)
def root():
    return "study-game-back OK"

@app.get("/health")
def health():
    return {"status": "healthy"}

@app.get("/version")
def version():
    return {"version": os.getenv("APP_VERSION", "0.1.0")}

# 掛載路由（放在 app 建好之後）
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

# --- entitlements (fallback for get_user_profile) ---
try:
    from .entitlements import has_access, get_user_profile as _get_user_profile
except Exception:
    from .entitlements import has_access
    def _get_user_profile(_user_id: Optional[str]) -> Dict[str, Any]:
        return {}

from .mailer_sendgrid import send_report_email

import boto3
from botocore.config import Config
from pydantic import BaseModel

REPORT_PAID_ONLY = os.getenv("REPORT_PAID_ONLY", "1") == "1"
EMAIL_RX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

class ReportPayload(BaseModel):
    to_email: Optional[str] = None
    student_name: Optional[str] = None
    grade: Optional[str] = None
    score: int
    total: int
    duration_min: Optional[int] = None
    summary: Optional[str] = None
    detail_rows: Optional[List[Dict[str, Any]]] = None

def _parse_subject_grade(slug: str) -> Tuple[str, int]:
    slug = (slug or "").strip().lower()
    subject = slug.split("/")[0] if slug else ""
    m = re.search(r"(?:grade|g)\s*(\d+)", slug)
    grade = int(m.group(1)) if m else 0
    return subject, grade

def need(name: str) -> str:
    v = os.getenv(name)
    if not v: raise RuntimeError(f"Missing environment variable: {name}")
    return v

app = FastAPI()

# 以環境變數設定多個允許來源，逗號分隔
# 例：CORS_ALLOW_ORIGINS="https://study-game-front.onrender.com,https://mypenisblue.com,https://www.mypenisblue.com"
ALLOWED = [o.strip() for o in os.getenv("CORS_ALLOW_ORIGINS", "").split(",") if o.strip()]

# 若沒設，開發期可以放寬為 * 並關閉 credentials
allow_all = (len(ALLOWED) == 0)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if allow_all else ALLOWED,
    allow_credentials=not allow_all,  # 若用 * 就不要帶 credentials
    allow_methods=["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
    allow_headers=["Content-Type","Authorization","X-Requested-With","X-User-Id"],
    max_age=86400,  # 保留：一天快取 preflight
)


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
        try: return b.decode(enc)
        except Exception: continue
    return b.decode("utf-8", errors="replace")

@app.get("/__test_mail")
def __test_mail(to: str):
    to = (to or "").strip()
    if not to or not EMAIL_RX.match(to):
        raise HTTPException(400, detail="Invalid email")

    # ✅ 同時接受 SENDGRID_FROM 或 EMAIL_FROM 其中之一
    has_from = os.getenv("SENDGRID_FROM") or os.getenv("EMAIL_FROM")
    if not os.getenv("SENDGRID_API_KEY") or not has_from:
        missing = []
        if not os.getenv("SENDGRID_API_KEY"): missing.append("SENDGRID_API_KEY")
        if not has_from: missing.append("SENDGRID_FROM or EMAIL_FROM")
        raise HTTPException(500, detail=f"Missing env: {', '.join(missing)}")

    try:
        ok, err = send_report_email(
            to_email=to,
            subject="[Study Game] 測試信件",
            html="<p>這是一封測試信件，如果你收到了，代表 SendGrid 設定OK。</p>",
        )
    except TypeError:
        ok, err = send_report_email(
            to,
            "[Study Game] 測試信件",
            "<p>這是一封測試信件，如果你收到了，代表 SendGrid 設定OK。</p>",
        )

    if not ok:
        raise HTTPException(502, detail=str(err))
    return {"ok": True}


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

@app.post("/report/send")
def send_report(
    payload: ReportPayload,
    slug: Optional[str] = Query(default=None),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
):
    if REPORT_PAID_ONLY:
        subject_code, grade_num = _parse_subject_grade(slug or "")
        if not has_access(x_user_id, subject_code, grade_num):
            raise HTTPException(status_code=402, detail="報告功能需購買方案")

    profile = _get_user_profile(x_user_id) if x_user_id else None
    to_email = (payload.to_email or (profile or {}).get("parent_email") or "").strip()
    if not to_email or not EMAIL_RX.match(to_email):
        raise HTTPException(status_code=400, detail="找不到家長電郵，請先在帳戶設定綁定")

    student_name = (payload.student_name or (profile or {}).get("student_name") or "").strip()
    grade_label  = (payload.grade or (profile or {}).get("grade") or "").strip()

    sc = max(0, int(payload.score or 0))
    tt = max(0, int(payload.total or 0))
    subject_line = f"{student_name or '學生'} 今日練習報告：{sc}/{tt}"

    def esc(s: Optional[str]) -> str:
        return html.escape(str(s or ""), quote=True)

    rows_html = ""
    if payload.detail_rows:
        parts = [
            "<table style='width:100%;border-collapse:collapse;font-size:14px'>",
            "<tr><th align='left'>題目</th><th align='left'>你的答案</th><th align='left'>正確答案</th></tr>",
        ]
        for r in (payload.detail_rows or [])[:50]:
            if not isinstance(r, dict): continue
            q = esc(r.get("q")); a = esc(r.get("yourAns")); c = esc(r.get("correct"))
            parts.append(
                "<tr>"
                f"<td style='border-top:1px solid #eee;padding:6px 4px'>{q}</td>"
                f"<td style='border-top:1px solid #eee;padding:6px 4px'>{a}</td>"
                f"<td style='border-top:1px solid #eee;padding:6px 4px'>{c}</td>"
                "</tr>"
            )
        parts.append("</table>")
        rows_html = "".join(parts)

    summary_html = f"<p style='margin-top:8px'>{esc(payload.summary).replace('\\n','<br>')}</p>" if payload.summary else ""
    duration = f" · 用時：{int(payload.duration_min)} 分" if payload.duration_min else ""

    html_body = f"""
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif">
      <h2 style="margin:0 0 8px">學習報告</h2>
      <div>學生：<b>{esc(student_name)}</b>{(' · 年級：'+esc(grade_label)) if grade_label else ''}</div>
      <div>分數：<b>{sc}/{tt}</b>{duration}</div>
      {summary_html}
      {rows_html}
      <p style="color:#666;font-size:12px;margin-top:16px">本電郵由系統自動發送。若有疑問，直接回覆本郵件即可。</p>
    </div>
    """.strip()

    ok, err = send_report_email(to_email=to_email, subject=subject_line, html=html_body)
    if not ok:
        raise HTTPException(status_code=502, detail=f"寄送失敗：{err}")
    return {"ok": True}
