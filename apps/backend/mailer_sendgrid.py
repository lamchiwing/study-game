# apps/backend/mailer_sendgrid.py
from __future__ import annotations

import os
import requests


def send_email(to: str, subject: str, html: str) -> None:
    """
    SendGrid REST API sender.
    If SENDGRID_API_KEY not set, it will log and skip (dev-safe).
    """
    api_key = os.getenv("SENDGRID_API_KEY")
    from_email = os.getenv("SENDGRID_FROM_EMAIL", "no-reply@example.com")

    if not api_key:
        # ✅ 開發/未設定 key 時，唔要令 app 爆炸
        print(f"[mailer_sendgrid] SENDGRID_API_KEY missing, skip sending to={to} subject={subject}")
        return

    url = "https://api.sendgrid.com/v3/mail/send"
    payload = {
        "personalizations": [{"to": [{"email": to}]}],
        "from": {"email": from_email},
        "subject": subject,
        "content": [{"type": "text/html", "value": html}],
    }
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

    r = requests.post(url, json=payload, headers=headers, timeout=15)
    if r.status_code >= 400:
        raise RuntimeError(f"SendGrid error {r.status_code}: {r.text}")


def send_report_email(to_email: str, subject: str, html: str):
    """Compatibility wrapper used by report router.

    Returns (ok: bool, message: str) instead of raising.
    """
    try:
        send_email(to=to_email, subject=subject, html=html)
        return True, ""
    except Exception as e:
        return False, str(e)
