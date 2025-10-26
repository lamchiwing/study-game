// apps/frontend/src/pages/CheckoutPage.tsx
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useSearchParams, Link } from "react-router-dom";

function normBase(s?: string) {
  let b = (s ?? "").trim().replace(/^['"]|['"]$/g, "").replace(/\/+$/, "");
  const m = b.match(/^(https?:\/\/[^/]+)(?:\/https?:\/\/[^/]+)?$/);
  return m ? m[1] : b;
}
const API_BASE =
  normBase(import.meta.env.VITE_API_BASE as string | undefined) ||
  "https://study-game-back.onrender.com";

const VALID_PLANS = new Set(["starter", "pro"]);

export default function CheckoutPage() {
  const [sp] = useSearchParams();
  const rawPlan = (sp.get("plan") || "starter").toLowerCase();
  const plan = VALID_PLANS.has(rawPlan) ? rawPlan : "starter";

  // 若 starter 需要 subject/grade
  const subject = sp.get("subject") || "chinese";
  const grade = sp.get("grade") || "grade1";

  const userId = useMemo(() => localStorage.getItem("uid") || "", []);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const firedRef = useRef(false); // 防止 StrictMode 重複觸發

  const goCheckout = useCallback(async () => {
    setBusy(true);
    setErr(null);
    // ✅ Log 1：確認 API_BASE 與即將呼叫的 URL
    console.log("Calling checkout", `${API_BASE}/api/billing/checkout`);
    
    try {
      const body: any = {
        plan,
        success_url: `${window.location.origin}/pricing`,
        cancel_url: `${window.location.origin}/pricing`,
      };
      if (plan === "starter") {
        body.subject = subject;
        body.grade = grade;
      }

      // ✅ Log 1：確認 API_BASE 與即將呼叫的 URL
      console.log("Calling checkout", `${API_BASE}/api/billing/checkout`);
      
      const res = await fetch(`${API_BASE}/api/billing/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(userId ? { "X-User-Id": userId } : {}),
        },
        credentials: "include", // 若用不到 cookie，可移除
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const url: string | undefined = data?.url;

      if (!url) {
        throw new Error("後端未回傳結帳連結（url）。");
      }
      window.location.assign(url);
    } catch (e: any) {
      setErr(e?.message || String(e));
      setBusy(false);
    }
  }, [API_BASE, plan, subject, grade, userId]);

  useEffect(() => {
    console.log("Calling checkout", `${API_BASE}/api/billing/checkout`);
    if (!firedRef.current) {
      firedRef.current = true;
      void goCheckout();
    }
  }, [goCheckout]);

  return (
    <div className="p-8 max-w-xl mx-auto">
      <h1 className="text-2xl font-semibold mb-2">正在前往付款…</h1>
      <p className="text-sm text-gray-600 mb-4">
        方案：<b>{plan}</b>{" "}
        {plan === "starter" ? (
          <>
            （{subject} · {grade}）
          </>
        ) : null}
      </p>
      <div className="rounded border p-3 bg-white/70 space-y-3">
        {busy && <div>連線 Stripe…</div>}
        {err && (
          <div className="text-red-600">
            無法建立結帳：{err}。你可以{" "}
            <button
              className="underline"
              onClick={goCheckout}
              disabled={busy}
            >
              重試
            </button>
            ，或 <Link className="underline" to="/pricing">返回方案頁</Link>。
          </div>
        )}
      </div>
    </div>
  );
}
