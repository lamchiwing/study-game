import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";

/**
 * ParentReportPage (B 方案)：前端接 token → 向後端換取短效報告連結 → 跳轉/顯示 UI
 *
 * 後端契約（建議）：
 *   GET /api/reports/:reportId?token=...
 *   200 { url: string, meta?: { student?: string; title?: string; createdAt?: string } }
 *   401/403/410 { error: string }
 *
 * 使用方式：
 *   1) 在 Router 加入：
 *      <Route path="/parent/report/:id" element={<ParentReportPage />} />
 *   2) 從 email 點入：/parent/report/<reportId>?token=eyJhbGciOi...
 */
export default function ParentReportPage() {
  const { id: reportId } = useParams();
  const [sp] = useSearchParams();
  const token = sp.get("token") || "";

  const [status, setStatus] = useState<
    | "idle"
    | "loading"
    | "ready"       // 拿到 url，等待使用者點擊或自動跳轉
    | "redirecting" // 正在跳轉到 S3 短效連結
    | "error"
  >("idle");

  const [error, setError] = useState<string>("");
  const [url, setUrl] = useState<string>("");
  const [meta, setMeta] = useState<{ student?: string; title?: string; createdAt?: string } | null>(null);

  // 倒數自動跳轉（可自行調整秒數）
  const AUTO_REDIRECT_SEC = 3;
  const [countdown, setCountdown] = useState<number>(AUTO_REDIRECT_SEC);
  const timerRef = useRef<number | null>(null);

  const createdDateText = useMemo(() => {
    if (!meta?.createdAt) return "";
    try {
      const d = new Date(meta.createdAt);
      return d.toLocaleString();
    } catch {
      return meta!.createdAt || "";
    }
  }, [meta]);

  useEffect(() => {
    if (!reportId || !token) {
      setStatus("error");
      setError("連結參數不完整，請從電郵重新開啟或到家長專區登入查看。");
      return;
    }

    const ctrl = new AbortController();
    const timeout = window.setTimeout(() => ctrl.abort(), 15000); // 15s 超時

    async function fetchUrl() {
      try {
        setStatus("loading");
        setError("");
        setUrl("");

        const res = await fetch(`/api/reports/${encodeURIComponent(reportId)}?token=${encodeURIComponent(token)}`,
          { method: "GET", signal: ctrl.signal, credentials: "include" }
        );

        if (!res.ok) {
          let msg = `無法取得報告（HTTP ${res.status}）`;
          try {
            const data = await res.json();
            if (data?.error) msg = data.error;
          } catch {}
          throw new Error(msg);
        }

        const data = await res.json();
        if (!data?.url) throw new Error("後端沒有回傳報告連結。");

        setUrl(data.url);
        setMeta(data.meta || null);
        setStatus("ready");
      } catch (e: any) {
        setStatus("error");
        setError(e?.message || "發生未知錯誤，請稍後再試。");
      } finally {
        window.clearTimeout(timeout);
      }
    }

    fetchUrl();

    return () => {
      ctrl.abort();
      window.clearTimeout(timeout);
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [reportId, token]);

  // 當進入 ready 狀態後，開始倒數自動跳轉
  useEffect(() => {
    if (status !== "ready") return;
    setCountdown(AUTO_REDIRECT_SEC);
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      setCountdown((s) => {
        if (s <= 1) {
          if (timerRef.current) window.clearInterval(timerRef.current);
          void handleOpen();
          return 0;
        }
        return s - 1;
      });
    }, 1000) as unknown as number;
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [status]);

  async function handleOpen() {
    if (!url) return;
    setStatus("redirecting");
    // 這裡用 window.location.assign 讓瀏覽器真的跳轉（保留 back stack）
    window.location.assign(url);
  }

  function handleRetry() {
    // 重新整理頁面，重新觸發 useEffect
    window.location.reload();
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-indigo-50 to-purple-50 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950 text-slate-800 dark:text-slate-100">
      <div className="max-w-2xl mx-auto px-4 py-10">
        <header className="mb-6">
          <Link to="/parent" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-200">
            <ArrowLeftIcon /> 返回家長專區
          </Link>
        </header>

        <div className="rounded-2xl shadow-xl border border-slate-200/60 dark:border-slate-800/60 bg-white/70 dark:bg-slate-900/60 backdrop-blur p-6">
          <div className="flex items-start gap-4 mb-4">
            <div className="shrink-0">
              {status === "loading" && <Badge icon={<SpinnerIcon />} color="blue" text="正在驗證連結" />}
              {status === "ready" && <Badge icon={<CheckIcon />} color="green" text="連結已驗證" />}
              {status === "redirecting" && <Badge icon={<SpinnerIcon />} color="indigo" text="正在開啟報告" />}
              {status === "error" && <Badge icon={<ErrorIcon />} color="rose" text="連結無效或已逾期" />}
            </div>
            <div className="grow">
              <h1 className="text-2xl font-semibold tracking-tight">學習報告</h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                請保持此視窗開啟；若未自動跳轉，請按下方按鈕。
              </p>
            </div>
          </div>

          {/* 報告基本資訊（若後端提供 meta） */}
          {meta && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
              <InfoTile label="學生" value={meta.student || "—"} />
              <InfoTile label="標題" value={meta.title || "—"} />
              <InfoTile label="建立時間" value={createdDateText || "—"} />
            </div>
          )}

          {/* 狀態區域 */}
          {status === "loading" && (
            <Panel>
              <div className="flex items-center gap-3"><SpinnerIcon />
                <span>正在連線伺服器並驗證權限…</span>
              </div>
            </Panel>
          )}

          {status === "ready" && (
            <Panel>
              <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">
                已取得報告連結，將在 <strong>{countdown}</strong> 秒後自動開啟。
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <PrimaryButton onClick={handleOpen}>
                  立即開啟報告
                </PrimaryButton>
                <CopyField label="短效連結（只讀）" value={url} />
              </div>
            </Panel>
          )}

          {status === "redirecting" && (
            <Panel>
              <div className="flex items-center gap-3"><SpinnerIcon />
                <span>正在開啟 S3 連結（若未自動跳轉，請點擊上方按鈕）。</span>
              </div>
            </Panel>
          )}

          {status === "error" && (
            <Panel tone="error">
              <div className="flex items-start gap-3">
                <ErrorIcon />
                <div>
                  <p className="font-medium">無法開啟報告</p>
                  <p className="text-sm opacity-80 mt-1">{error}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <PrimaryButton onClick={handleRetry}>重試</PrimaryButton>
                    <Link className="inline-flex items-center px-4 py-2 rounded-xl border border-slate-300/60 dark:border-slate-700/60 hover:bg-slate-50/60 dark:hover:bg-slate-800/60" to="/parent">
                      回家長專區
                    </Link>
                  </div>
                </div>
              </div>
            </Panel>
          )}

          <footer className="mt-8 text-xs text-slate-500 dark:text-slate-400">
            * 出於安全考量，連結具有效期；如逾期請重新從電郵開啟或登入家長專區。
          </footer>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------- UI ---------------------------------- */

function Panel({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "error" }) {
  const cls = tone === "error"
    ? "bg-rose-50/70 dark:bg-rose-900/20 border-rose-200/60 dark:border-rose-800/60"
    : "bg-slate-50/70 dark:bg-slate-800/40 border-slate-200/60 dark:border-slate-700/60";
  return (
    <div className={`rounded-xl border px-4 py-3 ${cls}`}>
      {children}
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200/60 dark:border-slate-800/60 bg-white/60 dark:bg-slate-900/40 p-4">
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">{label}</p>
      <p className="font-medium truncate" title={value}>{value}</p>
    </div>
  );
}

function Badge({ icon, color, text }: { icon?: React.ReactNode; color: "blue" | "green" | "indigo" | "rose"; text: string }) {
  const map: Record<string, string> = {
    blue: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-200 dark:border-blue-800/60",
    green: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-200 dark:border-emerald-800/60",
    indigo: "bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-200 dark:border-indigo-800/60",
    rose: "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-200 dark:border-rose-800/60",
  };
  return (
    <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs border ${map[color]}`}>
      {icon}<span>{text}</span>
    </span>
  );
}

function PrimaryButton({ onClick, children }: { onClick?: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm shadow-indigo-600/20 active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
    >
      <OpenIcon />
      <span className="ml-2">{children}</span>
    </button>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  async function onCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  }
  return (
    <div className="flex items-stretch w-full sm:max-w-full md:max-w-none lg:max-w-2xl">
      <label className="sr-only">{label}</label>
      <input
        readOnly
        value={value}
        className="flex-1 min-w-0 rounded-l-xl border border-slate-300/70 dark:border-slate-700/60 bg-white/70 dark:bg-slate-900/40 px-3 py-2 text-sm"
      />
      <button
        type="button"
        onClick={onCopy}
        className="rounded-r-xl border border-l-0 border-slate-300/70 dark:border-slate-700/60 px-3 text-sm hover:bg-slate-50/60 dark:hover:bg-slate-800/60"
      >
        {copied ? "已複製" : "複製"}
      </button>
    </div>
  );
}

/* -------------------------------- Icons --------------------------------- */
function ArrowLeftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="opacity-70"><path d="M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M19 12H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
  );
}
function SpinnerIcon() {
  return (
    <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" opacity="0.25"/>
      <path d="M21 12a9 9 0 0 1-9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
  );
}
function ErrorIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5"/><path d="M12 7v6m0 4.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
  );
}
function OpenIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M7 17l10-10M14 7h3v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
  );
}
