# apps/backend/app/mailer_sendgrid.py
import os
import re
import requests
from html import unescape

SENDGRID_API_KEY = os.getenv("SENDGRID_API_KEY")
EMAIL_FROM       = os.getenv("EMAIL_FROM")
EMAIL_FROM_NAME  = os.getenv("EMAIL_FROM_NAME", "Study Game Reports")
EMAIL_REPLY_TO   = os.getenv("EMAIL_REPLY_TO")

def _html_to_text(html: str) -> str:
    # ultra-light fallback plaintext to help deliverability
    text = re.sub(r"<br\s*/?>", "\n", html, flags=re.I)
    text = re.sub(r"</p\s*>", "\n\n", text, flags=re.I)
    text = re.sub(r"<[^>]+>", "", text)
    return unescape(text).strip()

def send_report_email(to_email: str, subject: str, html: str) -> tuple[bool, str]:
    if not SENDGRID_API_KEY:
        return False, "Missing SENDGRID_API_KEY"
    if not EMAIL_FROM:
        return False, "Missing EMAIL_FROM"
    if not to_email:
        return False, "Missing to_email"

    payload = {
        "personalizations": [
            {"to": [{"email": to_email}]}
        ],
        "from": {"email": EMAIL_FROM, "name": EMAIL_FROM_NAME},
        "subject": subject,
        "content": [
            {"type": "text/plain", "value": _html_to_text(html)},
            {"type": "text/html",  "value": html},
        ],
    }
    if EMAIL_REPLY_TO:
        payload["reply_to"] = {"email": EMAIL_REPLY_TO}

    try:
        r = requests.post(
            "https://api.sendgrid.com/v3/mail/send",
            headers={
                "Authorization": f"Bearer {SENDGRID_API_KEY}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=20,
        )
    except requests.RequestException as e:
        return False, f"network error: {e}"

    # SendGrid usually returns 202 Accepted on success
    if r.status_code == 202:
        return True, ""
    else:
        # surface useful error text from SendGrid
        return False, f"{r.status_code}: {r.text}"
