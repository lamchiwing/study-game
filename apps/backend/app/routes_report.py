# apps/backend/app/routes_report.py
from __future__ import annotations
import os
import re
import time
from typing import Optional, Tuple

from fastapi import APIRouter, HTTPException, Header, Query
from pydantic import BaseModel

from .entitlements import has_access, current_plan
from .mailer_sendgrid import send_report_email

router = APIRouter(prefix="/report", tags=["report"])

# === 行為開關 / 配額（可用環境變數覆蓋） ======================================
REPORT_PAID_ONLY = os.getenv("REPORT_PAID_ONLY", "true").lower() in ("1", "true", "yes")

REPORTS_PER_DAY_STARTER = int(os.getenv("REPORTS_PER_DAY_STARTER", "5"))
REPORTS_PER_DAY_PRO     = int(os.getenv("REPORTS_PER_DAY_PRO", "100"))
REPORT_COOLDOWN_STARTER = int(os.getenv("REPORT_COOLDOWN_STARTER", "60"))   # 秒
REPORT_COOLDOWN_PRO     = int(os.getenv("REPORT_COOLDOWN_PRO", "30"))

# === Email 驗證（簡易） ======================================================
EMAIL_RX = re.compile(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$")

# === slug → (subject, grade) 解析與標準化 ====================================
_SUBJ_ALIASES = {
    "cn": "chinese", "chi": "chinese", "zh": "chinese",
    "maths": "math", "mathematics": "math",
    "gen": "general", "gs": "general",
}
_VALID_SUBJECTS = {"chinese", "math", "general"}

def _norm_subject(s: Optional[str]) -> str:
    s = (s or "").strip().lower()
    return _SUBJ_ALIASES.get(s, s)

def _parse_grade(grade: Optional[str | int]) -> str:
    """
    接受 'p1'/'g1'/'grade1'/'1'/1 → 回 'grade1'；超出 1~6 或無法解析則回 ''。
    """
    if grade is None:
        return ""
    if isinstance(grade, int):
        g = grade
    else:
        t = grade.strip().lower()
        for pre in ("grade", "g", "p", "primary", "yr", "year"):
            if t.startswith(pre):
                t = t[len(pre):]
                break
        digits = "".join(ch for ch in t if ch.isdigit())
        g = int(digits) if digits.isdigit() else 0
    return f"grade{g}" if 1 <= g <= 6 else ""

def _parse_subject_grade(slug: str) -> Tuple[str, str]:
    """
    容忍多種 slug 型式：
      - chinese-p1 / chinese-grade1 / math-g2 / general-3
      - p1-chinese / grade3-math
      - 任意夾雜（packs/...），只要能抽出一個 subject + 一個 grade
    """
    s = (slug or "").strip().lower()
    parts = re.split(r"[^a-z0-9]+", s)
    subj, gnum = "", ""
    for tok in parts:
        if not tok:
            continue
        gg = _parse_grade(tok)
        if gg:
            gnum = gg
            continue
        ns = _norm_subject(tok)
        if ns in _VALID_SUBJECTS:
            subj = ns
    return subj, gnum

# === 報告配額與冷卻（簡易內存版） ===========================================
# 結構：{ user_id: [epoch_ts, ...] }
_REPORT_LOG: dict[str, list[int]] = {}

def _midnight_utc_ts() -> int:
    """
    今日 00:00:00（UTC）的 epoch 秒。若需歐洲/斯德哥爾摩時區，請自行加時區偏移。
    """
    t = time.gmtime()
    return int(time.mktime((t.tm_year, t.tm_mon, t.tm_mday, 0, 0, 0, 0, 0, -1)))

def _prune_and_count_today(user_id: str) -> int:
    start = _midnight_utc_ts()
    arr = _REPORT_LOG.get(user_id, [])
    arr = [ts for ts in arr if ts >= start]
    _REPORT_LOG[user_id] = arr
    return len(arr)

def _last_sent_ts(user_id: str) -> Optional[int]:
    arr = _REPORT_LOG.get(user_id, [])
    return max(arr) if arr else None

def _record_sent(user_id: str) -> None:
    _REPORT_LOG.setdefault(user_id, []).append(int(time.time()))

# === 請求模型 ===============================================================
class ReportPayload(BaseModel):
    to_email: str
    student_name: Optional[str] = ""
    score: Optional[int] = 0
    total: Optional[int] = 0
    # 可擴充更多欄位（answers、details、html 片段等）

# === 主路由 ================================================================
@router.post("/send")
def send_report(
    payload: ReportPayload,
    slug: Optional[str] = Query(default=None, description="例如 chinese-p1 / math-grade2"),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
):
    # 1) 參數檢查
    to_email = (payload.to_email or "").strip()
    if not to_email or not EMAIL_RX.match(to_email):
        raise HTTPException(status_code=400, detail="收件電郵格式不正確")

    # 2) slug 解析科目/年級（權限維度）
    subject, grade = _parse_subject_grade(slug or "")
    if not subject or not grade:
        raise HTTPException(status_code=400, detail="缺少科目或年級（slug 無法解析）")

    # 3) 權限 + 配額/冷卻
    if REPORT_PAID_ONLY:
        if not x_user_id:
            raise HTTPException(status_code=401, detail="Missing X-User-Id")

        if not has_access(x_user_id, subject, grade):
            # 前端可據此導向 /checkout?plan=starter&subject=...&grade=...
            raise HTTPException(status_code=402, detail="報告功能需購買方案")

        plan = current_plan(x_user_id)  # 'pro' | 'starter' | 'none'
        if plan not in ("pro", "starter"):
            raise HTTPException(status_code=402, detail="報告功能需購買方案")

        sent_today = _prune_and_count_today(x_user_id)
        if plan == "pro":
            if sent_today >= REPORTS_PER_DAY_PRO:
                raise HTTPException(status_code=429, detail="今日報告配額已用完（PRO）")
            cooldown = REPORT_COOLDOWN_PRO
        else:
            if sent_today >= REPORTS_PER_DAY_STARTER:
                raise HTTPException(status_code=429, detail="今日報告配額已用完（Starter）")
            cooldown = REPORT_COOLDOWN_STARTER

        last_ts = _last_sent_ts(x_user_id)
        if last_ts is not None and int(time.time()) - last_ts < cooldown:
            raise HTTPException(status_code=429, detail="寄送太頻密，請稍後再試")

    # 4) 準備信件 HTML（可改為你更完整的模板）
    student_name = (payload.student_name or "").strip() or "學生"
    sc = max(0, int(payload.score or 0))
    tt = max(0, int(payload.total or 0))

    subject_title_map = {"chinese": "中文", "math": "數學", "general": "常識"}
    subject_title = subject_title_map.get(subject, subject)
    grade_disp = grade.upper()  # e.g. GRADE1

    html = f"""
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto;line-height:1.6">
        <h2 style="margin:0 0 12px">Study Game 測驗報告</h2>
        <p style="margin:4px 0">學生：<b>{student_name}</b></p>
        <p style="margin:4px 0">科目 / 年級：<b>{subject_title} / {grade_disp}</b></p>
        <p style="margin:4px 0">分數：<b>{sc} / {tt}</b></p>
        <hr style="margin:16px 0;border:none;border-top:1px solid #e5e7eb"/>
        <p style="margin:4px 0;color:#6b7280">感謝使用 Study Game！</p>
      </div>
    """.strip()

    # 5) 發送（SendGrid）
    ok, msg = send_report_email(
        to_email=to_email,
        subject=f"Study Game 報告：{student_name} · {subject_title} · {grade_disp}",
        html=html,
    )
    if not ok:
        raise HTTPException(status_code=500, detail=f"寄送失敗：{msg}")

    # 6) 記錄成功寄送（用於配額/冷卻）
    if REPORT_PAID_ONLY and x_user_id:
        _record_sent(x_user_id)

    return {"ok": True, "sent_to": to_email, "subject": subject, "grade": grade}
