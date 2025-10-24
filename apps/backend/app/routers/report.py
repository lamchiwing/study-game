# apps/backend/app/routers/report.py
from __future__ import annotations

import os
import re
import time
import calendar
from typing import Optional, Tuple

from fastapi import APIRouter, HTTPException, Header, Query
from pydantic import BaseModel

# 用於依使用者時區計算「今天 00:00」
from datetime import datetime, time as dtime, timezone, timedelta
try:
    from zoneinfo import ZoneInfo  # Python 3.9+
except Exception:
    ZoneInfo = None  # 在沒有 zoneinfo 的環境下會退回用 UTC 或 offset 模式

# 從 app 層匯入你已有的權限與寄信工具
from ..entitlements import has_access, current_plan
from ..mailer_sendgrid import send_report_email

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
    支援：
      - chinese-p1 / chinese-grade1 / math-g2 / general-3
      - p1-chinese / grade3-math
      - 任意夾雜（packs/...），只要能抽出 subject + grade
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

# === 依使用者時區計算「今天 00:00」 =========================================
def _midnight_ts_from_client(tz_name: Optional[str], offset_min: Optional[int]) -> int:
    """
    回傳「使用者今天 00:00:00」的 epoch 秒數。
      - 優先使用 IANA 時區字串（X-User-Tz），例如 'Europe/Stockholm'
      - 次選使用分鐘偏移值（X-UTC-Offset），例如 -60（瑞典冬季）
      - 都沒有或無效 → 當作 UTC
    """
    now_utc = datetime.now(timezone.utc)

    # 1) IANA tz
    if tz_name and ZoneInfo:
        try:
            z = ZoneInfo(tz_name.strip())
            local_now = now_utc.astimezone(z)
            local_midnight = datetime.combine(local_now.date(), dtime(0, 0, 0), z)
            return int(local_midnight.timestamp())
        except Exception:
            pass

    # 2) offset（分鐘；JS 的 getTimezoneOffset 可能是負值）
    if isinstance(offset_min, int):
        try:
            # 在 Python 的 timedelta，中正數代表向東（+hours）
            # JS getTimezoneOffset: local = UTC - offset_min(minutes)
            # 例如：Stockholm 冬季 offset_min = -60 → local = UTC - (-60) = UTC + 60 min
            offset = -offset_min
            tz = timezone(timedelta(minutes=offset))
            local_now = now_utc.astimezone(tz)
            local_midnight = datetime.combine(local_now.date(), dtime(0, 0, 0), tz)
            return int(local_midnight.timestamp())
        except Exception:
            pass

    # 3) fallback: UTC 午夜
    t = now_utc
    utc_midnight = datetime.combine(t.date(), dtime(0, 0, 0), timezone.utc)
    return int(utc_midnight.timestamp())

# === 報告配額與冷卻（簡易內存） =============================================
_REPORT_LOG: dict[str, list[int]] = {}

def _prune_and_count_since(user_id: str, start_ts: int) -> int:
    arr = _REPORT_LOG.get(user_id, [])
    arr = [ts for ts in arr if ts >= start_ts]
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
    x_user_tz: Optional[str] = Header(default=None, alias="X-User-Tz"),
    x_utc_offset: Optional[str] = Header(default=None, alias="X-UTC-Offset"),
):
    # 1) 檢查 email
    to_email = (payload.to_email or "").strip()
    if not to_email or not EMAIL_RX.match(to_email):
        raise HTTPException(status_code=400, detail="收件電郵格式不正確")

    # 2) 解析科目/年級（如需當權限維度）
    subject, grade = _parse_subject_grade(slug or "")
    if not subject or not grade:
        raise HTTPException(status_code=400, detail="缺少科目或年級（slug 無法解析）")

    # 3) 權限 + 配額/冷卻
    if REPORT_PAID_ONLY:
        if not x_user_id:
            raise HTTPException(status_code=401, detail="Missing X-User-Id")

        if not has_access(x_user_id, subject, grade):
            raise HTTPException(status_code=402, detail="報告功能需購買方案")

        # 依使用者時區/偏移定義「今天 00:00」
        try:
            off = int(x_utc_offset) if (x_utc_offset is not None and str(x_utc_offset).strip() != "") else None
        except Exception:
            off = None
        local_day_start = _midnight_ts_from_client(x_user_tz, off)

        plan = current_plan(x_user_id)  # 'pro' | 'starter' | 'none'
        if plan not in ("pro", "starter"):
            raise HTTPException(status_code=402, detail="報告功能需購買方案")

        sent_today = _prune_and_count_since(x_user_id, local_day_start)
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

    # 4) 準備簡易 HTML（可換成你 email_templates.py 的模板）
    student_name = (payload.student_name or "").strip() or "學生"
    sc = max(0, int(payload.score or 0))
    tt = max(0, int(payload.total or 0))
    subject_title = {"chinese": "中文", "math": "數學", "general": "常識"}.get(subject, subject)
    grade_disp = grade.upper()

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

    # 5) 寄送
    ok, msg = send_report_email(
        to_email=to_email,
        subject=f"Study Game 報告：{student_name} · {subject_title} · {grade_disp}",
        html=html,
    )
    if not ok:
        # 也可以改 502 與較泛化訊息：raise HTTPException(502, "寄送失敗，請稍後再試")
        raise HTTPException(status_code=500, detail=f"寄送失敗：{msg}")

    # 6) 記錄成功寄送（供配額/冷卻使用）
    if REPORT_PAID_ONLY and x_user_id:
        _record_sent(x_user_id)

    return {"ok": True, "sent_to": to_email, "subject": subject, "grade": grade}
