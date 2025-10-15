# apps/backend/app/mailer_sendgrid.py
from __future__ import annotations
import os
import re
import time
import json
import requests
from html import unescape
from typing import Iterable, Optional, Sequence, Mapping, Tuple

SENDGRID_API_KEY = os.getenv("SENDGRID_API_KEY")
EMAIL_FROM       = os.getenv("EMAIL_FROM")                  # e.g. reports@yourdomain.com
EMAIL_FROM_NAME  = os.getenv("EMAIL_FROM_NAME", "Study Game Reports")
EMAIL_REPLY_TO   = os.getenv("EMAIL_REPLY_TO")              # optional, e.g. parent-support@yourdomain.com
EMAIL_REPLY_NAME = os.getenv("EMAIL_REPLY_NAME", "Parent Support")

# Optional defaults (can be overridden per call)
DEFAULT_CATEGORIES = os.getenv("SENDGRID_DEFAULT_CATEGORIES", "")  # e.g. "daily-report,quiz"
DEFAULT_SANDBOX    = os.getenv("SENDGRID_SANDBOX_MODE", "0") == "1"  # "1" to enable sandbox by default
DISABLE_TRACKING   = os.getenv("SENDGRID_DISABLE_TRACKING", "1") == "1"  # default to disable tracking

SEND_URL = "https://api.sendgrid.com/v3/mail/send"


def _html_to_text(html: str) -> str:
    """Ultra-light HTML→text，提升送達率（提供純文字part）"""
    text = re.sub(r"(?i)<br\s*/?>", "\n", html)
    text = re.sub(r"(?i)</p\s*>", "\n\n", text)
    text = re.sub(r"<[^>]+>", "", text)
    return unescape(text).strip()


def _ensure_list(emails: Iterable[str] | str | None) -> list[str]:
    if not emails:
        return []
    if isinstance(emails, str):
        return [emails.strip()]
    return [str(x).strip() for x in emails if str(x).strip()]


def _build_personalizations(
    to_emails: Sequence[str],
    cc_emails: Optional[Sequence[str]] = None,
    bcc_emails: Optional[Sequence[str]] = None,
    dynamic_data: Optional[Mapping[str, object]] = None,
) -> list[dict]:
    p = {
        "to": [{"email": e} for e in to_emails],
    }
    if cc_emails:
        p["cc"] = [{"email": e} for e in cc_emails]
    if bcc_emails:
        p["bcc"] = [{"email": e} for e in bcc_emails]
    if dynamic_data:
        # 可配合 Dynamic Templates 使用（若需要）
        p["dynamic_template_data"] = dict(dynamic_data)
    return [p]


def send_report_email(
    to: str | Sequence[str],
    subject: str,
    html: str,
    *,
    cc: Optional[Sequence[str]] = None,
    bcc: Optional[Sequence[str]] = None,
    categories: Optional[Sequence[str]] = None,
    custom_args: Optional[Mapping[str, str]] = None,
    reply_to_email: Optional[str] = None,
    reply_to_name: Optional[str] = None,
    sandbox: Optional[bool] = None,
    disable_tracking: Optional[bool] = None,
    max_retries: int = 3,
    timeout_sec: int = 20,
) -> Tuple[bool, str]:
    """
    回傳: (ok, message)
      - ok=True 時 message 可能包含 SendGrid X-Message-Id
      - ok=False 時 message 為錯誤描述（含狀態碼與 body）
    """
    if not SENDGRID_API_KEY:
        return False, "Missing SENDGRID_API_KEY"
    if not EMAIL_FROM:
        return False, "Missing EMAIL_FROM"

    to_list = _ensure_list(to)
    if not to_list:
        return False, "Missing recipient(s)"

    cc_list = _ensure_list(cc)
    bcc_list = _ensure_list(bcc)

    categories = list(categories or filter(None, (c.strip() for c in (DEFAULT_CATEGORIES.split(",") if DEFAULT_CATEGORIES else []))))
    use_sandbox = DEFAULT_SANDBOX if sandbox is None else bool(sandbox)
    track_off = DISABLE_TRACKING if disable_tracking is None else bool(disable_tracking)

    payload: dict = {
        "personalizations": _build_personalizations(
            to_emails=to_list, cc_emails=cc_list, bcc_emails=bcc_list
        ),
        "from": {"email": EMAIL_FROM, "name": EMAIL_FROM_NAME},
        "subject": subject,
        "content": [
            {"type": "text/plain", "value": _html_to_text(html)},
            {"type": "text/html",  "value": html},
        ],
    }

    # 可選：Reply-To
    rt_email = reply_to_email or EMAIL_REPLY_TO
    rt_name  = reply_to_name or EMAIL_REPLY_NAME
    if rt_email:
        payload["reply_to"] = {"email": rt_email, "name": rt_name}

    # 可選：Categories / Custom Args（方便 SendGrid 分類與 Webhook 追蹤）
    if categories:
        payload["categories"] = categories[:10]  # SendGrid up to 10
    if custom_args:
        # values must be strings
        payload["custom_args"] = {k: str(v) for k, v in custom_args.items()}

    # 追蹤設定（多數時候關閉能提高送達率）
    if track_off or use_sandbox:
        payload["tracking_settings"] = {
            "click_tracking": {"enable": False},
            "open_tracking": {"enable": False},
            "subscription_tracking": {"enable": False},
        }

    # Sandbox 模式（不真正發送）
    if use_sandbox:
        payload.setdefault("mail_settings", {})["sandbox_mode"] = {"enable": True}

    headers = {
        "Authorization": f"Bearer {SENDGRID_API_KEY}",
        "Content-Type": "application/json",
    }

    # 指數退避重試：429/5xx
    attempt = 0
    while True:
        attempt += 1
        try:
            r = requests.post(SEND_URL, headers=headers, json=payload, timeout=timeout_sec)
        except requests.RequestException as e:
            if attempt <= max_retries:
                time.sleep(min(2 ** attempt, 10))
                continue
            return False, f"network error: {e}"

        if r.status_code == 202:
            msg_id = r.headers.get("X-Message-Id") or r.headers.get("X-Message-Id".lower()) or ""
            return True, f"accepted{(' id=' + msg_id) if msg_id else ''}"

        # 429 / 5xx → 重試
        if r.status_code in (429, 500, 502, 503, 504) and attempt < max_retries:
            # 嘗試尊重 SendGrid 的 Retry-After
            ra = r.headers.get("Retry-After")
            delay = int(ra) if ra and ra.isdigit() else min(2 ** attempt, 10)
            time.sleep(delay)
            continue

        # 其他錯誤 → 回傳詳細訊息
        try:
            body = r.json()
            body_str = json.dumps(body, ensure_ascii=False)
        except Exception:
            body_str = r.text
        return False, f"{r.status_code}: {body_str}"
