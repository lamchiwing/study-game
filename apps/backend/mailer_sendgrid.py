# apps/backend/mailer_sendgrid.py
from __future__ import annotations

import os
import logging
import requests

logger = logging.getLogger(__name__)

SENDGRID_API_KEY = os.getenv("SENDGRID_API_KEY", "").strip()
SENDGRID_FROM_EMAIL = os.getenv("SENDGRID_FROM_EMAIL", "").strip()

def send_email(to: str, subject: str, html: str) -> bool:
    """
    ✅ 可以先用 stub；如果有 SENDGRID_API_KEY + FROM_EMAIL 就真寄
    """
    if not SENDGRID_API_KEY or not SENDGRID_FROM_EMAIL:
        logger.warning(
            "[send_email stub] Missing SENDGRID_API_KEY or SENDGRID_FROM_EMAIL. "
            "Skip sending. to=%s subject=%s",
            to, subject
        )
        return True

    url = "https://api.sendgrid.com/v3/mail/send"
    payload = {
        "personalizations": [{"to": [{"email": to}]}],
        "from": {"email": SENDGRID_FROM_EMAIL},
        "subject": subject,
        "content": [{"type": "text/html", "value": html}],
    }
    headers = {
        "Authorization": f"Bearer {SENDGRID_API_KEY}",
        "Content-Type": "application/json",
    }

    resp = requests.post(url, json=payload, headers=headers, timeout=20)
    if resp.status_code >= 400:
        logger.error("SendGrid failed: %s %s", resp.status_code, resp.text)
        return False
    return True
