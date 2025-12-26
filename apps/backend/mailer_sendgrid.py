# apps/backend/mailer_sendgrid.py

def send_email(to: str, subject: str, html: str) -> None:
    """
    暫時 stub 用。
    日後可接 SendGrid / SES / Resend。
    """
    print("=== send_email ===")
    print("TO:", to)
    print("SUBJECT:", subject)
    print("HTML:", html)
