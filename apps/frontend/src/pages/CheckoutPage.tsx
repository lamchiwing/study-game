import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useSearchParams, Link } from "react-router-dom";

/* -----------------------------------------------------------
   Utility: API base 正規化
----------------------------------------------------------- */
function normBase(s?: string) {
  let b = (s ?? "").trim().replace(/^['"]|['"]$/g, "").replace(/\/+$/, "");
  const m = b.match(/^(https?:\/\/[^/]+)(?:\/https?:\/\/[^/]+)?$/);
  return m ? m[1] : b;
}
const API_BASE =
  normBase(import.meta.env.VITE_API_BASE as string | undefined) ||
  "https://study-game-back.onrender.com";

/* -----------------------------------------------------------
   常數與型別
----------------------------------------------------------- */
const VALID_PLANS = new Set(["starter", "pro"]);

type BaseCheckoutPayload = {
  success_url: string;
  cancel_url: string;
};

type StarterPayload = BaseCheckoutPayload & {
  plan: "starter";
  subject: string;
  grade: string;
};

type ProPayload = BaseCheckoutPayload & {
  plan: "pro";
  /** 可選：多選科目與年級（逗號分隔），沒有就讓後端 fallback 成通用 Pro */
  subjects_csv?: string;
  grades_csv?: string;
};

type CheckoutPayload = StarterPayload | ProPayload;

/* -----------------------------------------------------------
   元件主體
----------------------------------------------------------- */
export default function CheckoutPage() {
  const [sp] = useSearchParams();

  const rawPlan = (sp.get("plan") || "starter").toLowerCase();
  const plan: "starter" | "pro" = VALID_PLANS.has(rawPlan)
    ? (rawPlan as "starter" | "pro")
    : "starter";

  const subject = sp.get("subject") || "chinese";
  const grade = sp.get("grade") || "grade1";

  // 供 Pro 可選多個（例: ?plan=pro&subjects=math,chinese&grades=grade1,grade3）
  const subjectsCsv = useMemo(() => (sp.get("subjects") || "").trim(), [sp]);
  const gradesCsv = useMemo(() => (sp.get("grades") || "").trim(), [sp]);

  const userId = useMemo(() => {
    let id = localStorage.getItem("uid");
    if (!id) {
      const rand = Math.random().toString(36).slice(2);
      const ts = Date.now().toString(36);
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? (crypto as any).randomUUID()
          : `anon_${ts}_${rand}`;
      localStorage.setItem("uid", id);
    }
    return id;
  }, []);

  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const firedRef = useRef(false); // 防止 StrictMode 重複觸發

  /* -----------------------------------------------------------
     結帳函式
  ----------------------------------------------------------- */
  const goCheckout = useCallback(async () => {
    setBusy(true);
    setErr(null);

    const success = `${window.location.origin}/pricing`;
    const cancel = `${window.location.origin}/pricing`;

    const body: CheckoutPayload =
      plan === "starter"
        ? {
            plan: "starter",
            subject,
            grade,
            success_url: success,
            cancel_url: cancel,
          }
        : {
            plan: "pro",
            subjects_csv: subjectsCsv || undefined,
            grades_csv: gradesCsv || undefined,
            success_url: success,
            cancel_url: cancel,
          };

    try {
      const res = await fetch(`${API_BASE}/api/billing/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(userId ? { "X-User-Id": userId } : {}),
        },
        credentials: "include",
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `HTTP ${res.status}`);
      }

      const data = await res.json().catch(() => ({}));
      const url: string | undefined = data?.url;

      if (!url) throw new Error("後端未回傳結帳連結（url）。");
      window.location.assign(url);
    } catch (e: any) {
      setErr(e?.message || String(e));
      setBusy(false);
    }
  }, [API_BASE, plan, subject, grade, subjectsCsv, gradesCsv, userId]);

  /* -----------------------------------------------------------
     初始化觸發一次
  ----------------------------------------------------------- */
  useEffect(() => {
    if (!firedRef.current) {
      firedRef.current = true;
      void goCheckout();
    }
  }, [goCheckout]);

  /* -----------------------------------------------------------
     UI
  ----------------------------------------------------------- */
  return (
    <div className="p-8 max-w-xl mx-auto">
      <h1 className="text-2xl font-semibold mb-2">正在前往付款…</h1>
      <p className="text-sm text-gray-600 mb-4">
        方案：<b>{plan}</b>{" "}
        {plan === "starter" ? <>（{subject} · {grade}）</> : null}
      </p>

      <div className="rounded border p-3 bg-white/70 space-y-3">
        {busy && <div>連線 Stripe…</div>}
        {err && (
          <div className="text-red-600">
            無法建立結帳：{err}。你可以{" "}
            <button className="underline" onClick={goCheckout} disabled={busy}>
              重試
            </button>
            ，或{" "}
            <Link className="underline" to="/pricing">
              返回方案頁
            </Link>
            。
          </div>
        )}
      </div>
    </div>
  );
}
