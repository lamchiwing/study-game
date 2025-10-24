// apps/frontend/src/lib/report.ts
function normBase(s?: string) {
  let b = (s ?? "").trim().replace(/^['"]|['"]$/g, "").replace(/\/+$/, "");
  return b || "https://study-game-back.onrender.com"; // fallback
}
const API_BASE = normBase(import.meta.env.VITE_API_BASE as string | undefined);

// 與後端一致的解析
export function parseSubjectGrade(slug?: string) {
  const s = (slug || "").toLowerCase();
  const parts = s.split(/[^a-z0-9]+/).filter(Boolean);
  let subject = ""; let grade = "";
  const map: Record<string, string> = {
    cn: "chinese", chi: "chinese", zh: "chinese",
    maths: "math", mathematics: "math",
    gen: "general", gs: "general",
  };
  const valid = new Set(["chinese", "math", "general"]);

  const normSub = (x: string) => map[x.toLowerCase()] || x.toLowerCase();
  const toGradeToken = (x: string) => {
    let t = x.toLowerCase();
    for (const pre of ["grade", "g", "p", "primary", "yr", "year"]) {
      if (t.startsWith(pre)) { t = t.slice(pre.length); break; }
    }
    const digits = t.replace(/[^0-9]/g, "");
    const n = digits ? parseInt(digits, 10) : 0;
    return (n >= 1 && n <= 6) ? `grade${n}` : "";
  };

  for (const tok of parts) {
    const gg = toGradeToken(tok);
    if (gg) { grade = gg; continue; }
    const ns = normSub(tok);
    if (valid.has(ns)) { subject = ns; }
  }
  return { subject, grade };
}

export async function sendReportEmail({
  slug,
  toEmail,
  studentName,
  score,
  total,
  onInfo,
  onError,
}: {
  slug: string;
  toEmail: string;
  studentName: string;
  score: number;
  total: number;
  onInfo?: (m: string) => void;
  onError?: (m: string) => void;
}) {
  const uid = localStorage.getItem("uid") || "";
  try {
    const res = await fetch(`${API_BASE}/report/send?slug=${encodeURIComponent(slug)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-User-Id": uid },
      body: JSON.stringify({
        to_email: toEmail,
        student_name: studentName,
        score,
        total,
      }),
    });

    if (res.ok) { onInfo?.("報告已寄出 ✅"); return true; }

    const text = await res.text();
    if (res.status === 402) {
      const { subject, grade } = parseSubjectGrade(slug);
      onInfo?.("此功能需購買方案，正前往結帳頁…");
      const q = new URLSearchParams({ plan: "starter", subject, grade });
      window.location.assign(`/checkout?${q.toString()}`);
      return false;
    }
    if (res.status === 429) { onError?.("寄送過於頻密或已達今日上限，請稍後再試。"); return false; }
    if (res.status === 400) { onError?.("資料不完整或格式有誤（請檢查電郵、科目與年級）。"); return false; }
    if (res.status === 401) { onError?.("缺少用戶識別（X-User-Id）。請重新整理再試。"); return false; }

    onError?.(`寄送失敗：${text || `HTTP ${res.status}`}`); return false;
  } catch (e: any) {
    onError?.(`連線失敗：${e?.message || e}`); return false;
  }
}
