# apps/backend/app/routers/report.py
from __future__ import annotations

import os
import re
import time
import calendar
from typing import Optional, Tuple

from fastapi import APIRouter, HTTPException, Header, Query
from pydantic import BaseModel

from datetime import datetime, time as dtime, timezone, timedelta
try:
    from zoneinfo import ZoneInfo  # Python 3.9+
except Exception:
    ZoneInfo = None

# === 匯入內部工具 ===
from ..entitlements import has_access, current_plan
from mailer_sendgrid import send_report_email

router = APIRouter(prefix="/report", tags=["report"])

# === 行為與配額設定（可由環境變數覆蓋） ===
REPORT_PAID_ONLY = os.getenv("REPORT_PAID_ONLY", "true").lower() in ("1", "true", "yes")

REPORTS_PER_DAY_STARTER = int(os.getenv("REPORTS_PER_DAY_STARTER", "5"))
REPORTS_PER_DAY_PRO     = int(os.getenv("REPORTS_PER_DAY_PRO", "100"))
REPORT_COOLDOWN_STARTER = int(os.getenv("REPORT_COOLDOWN_STARTER", "60"))   # 秒
REPORT_COOLDOWN_PRO     = int(os.getenv("REPORT_COOLDOWN_PRO", "30"))

EMAIL_RX = re.compile(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$")

# === slug → subject, grade 解析 ===
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

# === 使用者時區午夜計算 ===
def _midnight_ts_from_client(tz_name: Optional[str], offset_min: Optional[int]) -> int:
    now_utc = datetime.now(timezone.utc)

    # 1) 若提供 IANA 時區
    if tz_name and ZoneInfo:
        try:
            z = ZoneInfo(tz_name.strip())
            local_now = now_utc.astimezone(z)
            local_midnight = datetime.combine(local_now.date(), dtime(0, 0, 0), z)
            return int(local_midnight.timestamp())
        except Exception:
            pass

    # 2) 若僅提供分鐘 offset（JS 的 getTimezoneOffset）
    if isinstance(offset_min, int):
        try:
            offset = -offset_min  # JS offset 為反向值
            tz = timezone(timedelta(minutes=offset))
            local_now = now_utc.astimezone(tz)
            local_midnight = datetime.combine(local_now.date(), dtime(0, 0, 0), tz)
            return int(local_midnight.timestamp())
        except Exception:
            pass

    # 3) fallback: UTC 午夜
    utc_midnight = datetime.combine(now_utc.date(), dtime(0, 0, 0), timezone.utc)
    return int(utc_midnight.timestamp())

# === 發送紀錄（簡易記憶體內存） ===
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

# === 資料模型 ===
class ReportPayload(BaseModel):
    to_email: str
    student_name: Optional[str] = ""
    score: Optional[int] = 0
    total: Optional[int] = 0

# === 主路由 ===
@router.post("/send")
def send_report(
    payload: ReportPayload,
    slug: Optional[str] = Query(default=None, description="例如 chinese-p1 / math-grade2"),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
    x_user_tz: Optional[str] = Header(default=None, alias="X-User-Tz"),
    x_utc_offset: Optional[str] = Header(default=None, alias="X-UTC-Offset"),
):
    # 1) 驗證電郵
    to_email = (payload.to_email or "").strip()
    if not to_email or not EMAIL_RX.match(to_email):
        raise HTTPException(400, "收件電郵格式不正確")

    # 2) 解析 slug → 科目與年級
    subject, grade = _parse_subject_grade(slug or "")
    if not subject or not grade:
        raise HTTPException(400, "缺少科目或年級（slug 無法解析）")

    # 3) 權限與配額檢查
    if REPORT_PAID_ONLY:
        if not x_user_id:
            raise HTTPException(401, "Missing X-User-Id")

        if not has_access(x_user_id, subject, grade):
            raise HTTPException(402, "報告功能需購買方案")

        # 計算當地日界線
        try:
            off = int(x_utc_offset) if (x_utc_offset and str(x_utc_offset).strip() != "") else None
        except Exception:
            off = None
        local_day_start = _midnight_ts_from_client(x_user_tz, off)

        plan = current_plan(x_user_id)
        if plan not in ("starter", "pro"):
            raise HTTPException(402, "報告功能需購買方案")

        sent_today = _prune_and_count_since(x_user_id, local_day_start)
        cooldown = REPORT_COOLDOWN_PRO if plan == "pro" else REPORT_COOLDOWN_STARTER
        max_daily = REPORTS_PER_DAY_PRO if plan == "pro" else REPORTS_PER_DAY_STARTER

        if sent_today >= max_daily:
            raise HTTPException(429, f"今日報告配額已用完（{plan.upper()}）")

        last_ts = _last_sent_ts(x_user_id)
        if last_ts and int(time.time()) - last_ts < cooldown:
            raise HTTPException(429, "寄送太頻密，請稍後再試")

    # 4) 準備 Email 內容
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

    # 5) 發送郵件
    ok, msg = send_report_email(
        to_email=to_email,
        subject=f"Study Game 報告：{student_name} · {subject_title} · {grade_disp}",
        html=html,
    )
    if not ok:
        raise HTTPException(500, f"寄送失敗：{msg}")

    # 6) 紀錄發送時間
    if REPORT_PAID_ONLY and x_user_id:
        _record_sent(x_user_id)

    return {"ok": True, "sent_to": to_email, "subject": subject, "grade": grade}
