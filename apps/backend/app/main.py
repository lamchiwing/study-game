# --- imports (替換你原本的這幾行) ---
import os, io, csv, random, re, html
from typing import Optional, List, Dict, Any, Tuple

from fastapi import Header, FastAPI, UploadFile, File, Query, HTTPException, Request
from fastapi.responses import JSONResponse, PlainTextResponse
from fastapi.middleware.cors import CORSMiddleware

# ✅ has_access 一定要；get_user_profile 沒有也不會掛
try:
    from .entitlements import has_access, get_user_profile as _get_user_profile
except Exception:
    from .entitlements import has_access  # 只拿到 has_access 也可以
    def _get_user_profile(_user_id: Optional[str]) -> Dict[str, Any]:
        # 後備：若你的系統尚未實作 user profile，就回空值讓下游 fallback
        return {}

from .mailer_sendgrid import send_report_email

import boto3
from botocore.config import Config
from pydantic import BaseModel


# -------------------------------
# Feature flags & regex
# -------------------------------
REPORT_PAID_ONLY = os.getenv("REPORT_PAID_ONLY", "1") == "1"
EMAIL_RX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# -------------------------------
# Models
# -------------------------------
class ReportPayload(BaseModel):
    # to_email 可選：若未提供，會從使用者 profile 取 parent_email
    to_email: Optional[str] = None
    student_name: Optional[str] = None
    grade: Optional[str] = None
    score: int
    total: int
    duration_min: Optional[int] = None
    summary: Optional[str] = None
    # {q, yourAns, correct}
    detail_rows: Optional[List[Dict[str, Any]]] = None

# -------------------------------
# Utils
# -------------------------------
def _parse_subject_grade(slug: str) -> Tuple[str, int]:
    """
    "math/grade1/20m" -> ("math", 1)
    "math/Grade02/setA" -> ("math", 2)
    "chinese/g1/pack" -> ("chinese", 1)
    """
    slug = (slug or "").strip().lower()
    subject = ""
    if slug:
        parts = slug.split("/")
        subject = parts[0] if parts else ""
    m = re.search(r"(?:grade|g)\s*(\d+)", slug)
    grade = int(m.group(1)) if m else 0
    return subject, grade

def need(name: str) -> str:
    v = os.getenv(name)
    if not v:
        raise RuntimeError(f"Missing environment variable: {name}")
    return v

# -------------------------------
# App & CORS
# -------------------------------
app = FastAPI()

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

# -------------------------------
# S3 / R2
# -------------------------------
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
# 回到原本的（只允許 ASCII；大小寫不敏感）
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

# -------------------------------
# Health
# -------------------------------
@app.get("/", response_class=PlainTextResponse)
def root():
    return "study-game-back OK"

# -------------------------------
# Test mail
# -------------------------------
@app.get("/__test_mail")
def __test_mail(to: str):
    to = (to or "").strip()
    if not to or not EMAIL_RX.match(to):
        raise HTTPException(400, detail="Invalid email")

    # 檢查環境變數（避免 500）
    missing = [k for k in ("SENDGRID_API_KEY", "SENDGRID_FROM") if not os.getenv(k)]
    if missing:
        raise HTTPException(500, detail=f"Missing env: {', '.join(missing)}")

    # 兼容不同函式簽名
    try:
        ok, err = send_report_email(to_email=to,
                                    subject="[Study Game] 測試信件",
                                    html="<p>這是一封測試信件，如果你收到了，代表 SendGrid 設定OK。</p>")
    except TypeError:
        # 舊簽名：send_report_email(to, subject, html)
        ok, err = send_report_email(to,
                                    "[Study Game] 測試信件",
                                    "<p>這是一封測試信件，如果你收到了，代表 SendGrid 設定OK。</p>")

    if not ok:
        # 把錯誤回給前端，方便排查
        raise HTTPException(502, detail=str(err))
    return {"ok": True}

# -------------------------------
# Upload CSV
# -------------------------------
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

# main.py (list_packs 之前或檔案頂部)

TITLE_MAP = {
    "chinese/grade1/mixed-colored-demo": "小一｜中文｜顏色混合示例",
    "chinese/grade1/mixed-chi3-demofixed": "小一｜中文｜混合題（chi3）",
    "math/grade1/20l": "小一｜數學｜1–20（容易）",
    "math/grade1/20m": "小一｜數學｜1–20（中等）",
    "math/grade1/20h": "小一｜數學｜1–20（困難）",
}

CUSTOM_ORDER = {
    "chinese/grade1/mixed-colored-demo": 0,
    "chinese/grade1/mixed-chi3-demofixed": 1,
    "math/grade1/20l": 2,
    "math/grade1/20m": 3,
    "math/grade1/20h": 4,
    "math/grade1/l": 5,
    "math/grade1/m": 6,
    "math/grade1/h": 7,
}

SUBJECT_ORDER = {"chinese": 0, "math": 1}
GRADE_ORDER   = {"grade1": 1, "g1": 1, "grade2": 2, "g2": 2}

def rank(item):
    slug = item["slug"]
    parts = slug.split("/")
    subject = parts[0] if len(parts) > 0 else ""
    grade = parts[1] if len(parts) > 1 else ""
    return (
        CUSTOM_ORDER.get(slug, 9999),
        SUBJECT_ORDER.get(subject, 999),
        GRADE_ORDER.get(grade, 999),
        slug,
    )

# 在 list_packs() 迴圈 append 完 items 後：
for it in items:
    it["title"] = TITLE_MAP.get(it["slug"]) or it["title"]

items.sort(key=rank)
return items


# -------------------------------
# List packs
# -------------------------------
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
            # 預設用 slug 末段產生英文 Title（前端已有 fallback 可顯示中文）
            title = parts[-1].replace("-", " ").title() if parts else slug
            subject = parts[0] if len(parts) > 0 else ""
            grade = parts[1] if len(parts) > 1 else ""
            items.append({"slug": slug, "title": title, "subject": subject, "grade": grade})

        if resp.get("IsTruncated") and resp.get("NextContinuationToken"):
            kwargs["ContinuationToken"] = resp["NextContinuationToken"]
        else:
            break

    # 也可改回 {"packs": items}；前端已兼容兩種
    return items

# -------------------------------
# Get quiz
# -------------------------------
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
      {"title": "...", "list":[...], "usedUrl":"s3://bucket/key.csv", "debug":"rows=.., picked=.., seed=.."}
    """
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

    # 取整包標題（若 CSV 有 title/標題 欄）
    pack_title = ""
    for r in rows:
        t = (r.get("title") or r.get("標題") or "").strip()
        if t:
            pack_title = t
            break

    # 組題目
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

# -------------------------------
# Email report
# -------------------------------
@app.post("/report/send")
def send_report(
    payload: ReportPayload,
    slug: Optional[str] = Query(default=None),   # 前端帶目前題包 slug
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
):
    # 1) 付費/授權檢查（需購買才可寄）
    if REPORT_PAID_ONLY:
        subject_code, grade_num = _parse_subject_grade(slug or "")
        if not has_access(x_user_id, subject_code, grade_num):
            raise HTTPException(status_code=402, detail="報告功能需購買方案")

    # 2) 從使用者資料查家長電郵/學生資料（payload 可覆蓋）
    profile = _get_user_profile(x_user_id) if x_user_id else None  # 例如 {"parent_email": "...", "student_name": "...", "grade": "P1"}
    to_email = (payload.to_email or (profile or {}).get("parent_email") or "").strip()
    if not to_email or not EMAIL_RX.match(to_email):
        raise HTTPException(status_code=400, detail="找不到家長電郵，請先在帳戶設定綁定")

    student_name = (payload.student_name or (profile or {}).get("student_name") or "").strip()
    grade_label = (payload.grade or (profile or {}).get("grade") or "").strip()

    sc = max(0, int(payload.score or 0))
    tt = max(0, int(payload.total or 0))
    subject_line = f"{student_name or '學生'} 今日練習報告：{sc}/{tt}"

    # 3) 安全轉義（避免把前端 HTML 直接塞進信件）
    def esc(s: Optional[str]) -> str:
        return html.escape(str(s or ""), quote=True)

    # 4) 明細表（最多 50 筆）
    rows_html = ""
    if payload.detail_rows:
        parts = [
            "<table style='width:100%;border-collapse:collapse;font-size:14px'>",
            "<tr><th align='left'>題目</th><th align='left'>你的答案</th><th align='left'>正確答案</th></tr>",
        ]
        for r in (payload.detail_rows or [])[:50]:
            q = esc(r.get("q")) if isinstance(r, dict) else ""
            a = esc(r.get("yourAns")) if isinstance(r, dict) else ""
            c = esc(r.get("correct")) if isinstance(r, dict) else ""
            parts.append(
                "<tr>"
                f"<td style='border-top:1px solid #eee;padding:6px 4px'>{q}</td>"
                f"<td style='border-top:1px solid #eee;padding:6px 4px'>{a}</td>"
                f"<td style='border-top:1px solid #eee;padding:6px 4px'>{c}</td>"
                "</tr>"
            )
        parts.append("</table>")
        rows_html = "".join(parts)

    # 5) 其他欄位
    summary_html = ""
    if payload.summary:
        summary_html = f"<p style='margin-top:8px'>{esc(payload.summary).replace('\\n','<br>')}</p>"
    duration = f" · 用時：{int(payload.duration_min)} 分" if payload.duration_min else ""

    # 6) 信件 HTML
    html_body = f"""
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif">
      <h2 style="margin:0 0 8px">學習報告</h2>
      <div>學生：<b>{esc(student_name)}</b>{(' · 年級：'+esc(grade_label)) if grade_label else ''}</div>
      <div>分數：<b>{sc}/{tt}</b>{duration}</div>
      {summary_html}
      {rows_html}
      <p style="color:#666;font-size:12px;margin-top:16px">
        本電郵由系統自動發送。若有疑問，直接回覆本郵件即可。
      </p>
    </div>
    """.strip()

    # 7) 寄送
    ok, err = send_report_email(to_email=to_email, subject=subject_line, html=html_body)
    if not ok:
        raise HTTPException(status_code=502, detail=f"寄送失敗：{err}")
    return {"ok": True}
