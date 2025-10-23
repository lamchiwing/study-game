import { useEffect, useMemo, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";

function normBase(s?: string) {
  let b = (s ?? "").trim().replace(/^['"]|['"]$/g, "").replace(/\/+$/, "");
  const m = b.match(/^(https?:\/\/[^/]+)(?:\/https?:\/\/[^/]+)?$/);
  return m ? m[1] : b;
}
const API_BASE = normBase(import.meta.env.VITE_API_BASE as string | undefined) || "https://study-game-back.onrender.com";

export default function CheckoutPage() {
  const [sp] = useSearchParams();
  const plan = sp.get("plan") || "starter"; // starter | pro
  // 若你要讓家長在這頁選科目/年級，可加兩個 select；這裡示範也從 query 讀：
  const subject = sp.get("subject") || "chinese";
  const grade   = sp.get("grade") || "grade1";

  const userId = useMemo(() => localStorage.getItem("uid") || "", []);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function goCheckout() {
    setBusy(true);
    setErr(null);
    try {
      const body = {
        plan,
        subject: plan === "starter" ? subject : null,
        grade:   plan === "starter" ? grade : null,
        success_url: window.location.origin + "/pricing", // 成功回到方案頁（可改 /packs）
        cancel_url:  window.location.origin + "/pricing",
      };
      const res = await fetch(`${API_BASE}/api/billing/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-User-Id": userId },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      const { url } = await res.json();
      window.location.assign(url);
    } catch (e: any) {
      setErr(e?.message || String(e));
      setBusy(false);
    }
  }

  useEffect(() => { goCheckout(); /* 進來就自動送去 Stripe */ }, []);

  return (
    <div className="p-8 max-w-xl mx-auto">
      <h1 className="text-2xl font-semibold mb-2">正在前往付款…</h1>
      <p className="text-sm text-gray-600 mb-4">
        方案：<b>{plan}</b> {plan === "starter" ? <>（{subject} · {grade}）</> : null}
      </p>
      <div className="rounded border p-3 bg-white/70">
        {busy && <div>連線 Stripe…</div>}
        {err && (
          <div className="text-red-600">
            無法建立結帳：{err}。你可以{" "}
            <button className="underline" onClick={goCheckout}>重試</button>
            ，或 <Link className="underline" to="/pricing">返回方案頁</Link>。
          </div>
        )}
      </div>
    </div>
  );
}
