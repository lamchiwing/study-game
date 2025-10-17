# apps/backend/app/email_templates.py
from urllib.parse import quote

def compose_parent_report_email(*, parent_name: str, student_name: str,
                                report_title: str, report_url: str) -> tuple[str, str]:
    subject = f"【{student_name}】{report_title} 已產生"
    preview = f"{student_name} 的最新學習報告已準備就緒。"

    html = f"""<!doctype html><html><body style="font-family:system-ui,Segoe UI,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:24px;">
    <p style="color:#666;font-size:12px;margin:0 0 12px 0;">{preview}</p>
    <h2 style="margin:0 0 12px 0;">你好，{parent_name}</h2>
    <p>孩子 <strong>{student_name}</strong> 的報告「<strong>{report_title}</strong>」已建立。</p>
    <p style="margin:16px 0;">
      <a href="{report_url}" style="display:inline-block;padding:12px 18px;text-decoration:none;border-radius:8px;border:1px solid #3b82f6;">
        立即查看報告
      </a>
    </p>
    <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
    <p style="color:#666;font-size:12px;margin:0;">
      * 此連結將於 15 分鐘後失效；若連結失效，請到家長專區登入查看。
    </p>
  </div>
</body></html>"""
    return subject, html
