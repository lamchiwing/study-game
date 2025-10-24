// apps/frontend/src/pages/PacksPage.tsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { titleFromSlug } from "../data/titles";


type Pack = {
  slug: string;
  title?: string;
  subject?: string;
  grade?: string;
  isPaid?: boolean;
};

// ---------- 中文標題 fallback ----------
const TITLE_FALLBACK: Record<string, string> = {
  "chinese/grade1/mixed-chi3-demofixed": "小一｜中文｜混合題（chi3）",
  "chinese/grade1/mixed-colored-demo": "小一｜中文｜顏色混合示例",
  "math/grade1/20l": "小一｜數學｜1–20（初階）",
  "math/grade1/20m": "小一｜數學｜1–20（中階）",
  "math/grade1/20h": "小一｜數學｜1–20（高階）",
  "math/grade1/l": "小一｜數學｜基礎（初階）",
  "math/grade1/m": "小一｜數學｜基礎（中階）",
  "math/grade1/h": "小一｜數學｜基礎（高階）",
};

// ---------- 可選：固定排序 ----------
const CUSTOM_ORDER: Record<string, number> = {
  "chinese/grade1/mixed-colored-demo": 0,
  "chinese/grade1/mixed-chi3-demofixed": 1,
  "math/grade1/20l": 2,
  "math/grade1/20m": 3,
  "math/grade1/20h": 4,
  "math/grade1/l": 5,
  "math/grade1/m": 6,
  "math/grade1/h": 7,
};

// ---------- 可選：暫時標記哪些是付費 ----------
const PAID_SLUGS = new Set<string>([
  // "chinese/grade1/mixed-colored-demo",
]);

// --- 工具：規整 BASE 並去掉重複貼上 ---
function normBase(s: string | undefined) {
  let b = (s ?? "").trim();
  b = b.replace(/^['"]|['"]$/g, "");
  b = b.replace(/\/+$/, "");
  const m = b.match(/^(https?:\/\/[^/]+)(?:\/https?:\/\/[^/]+)?$/);
  return m ? m[1] : b;
}
const dedupe = (arr: string[]) => Array.from(new Set(arr.filter(Boolean)));

async function fetchFirstOk<T = any>(paths: string[], signal?: AbortSignal): Promise<T> {
  for (const url of paths) {
    try {
      const r = await fetch(url, { signal });
      if (!r.ok) {
        if (r.status === 404) continue;
        throw new Error(`HTTP ${r.status} @ ${url}`);
      }
      return await r.json();
    } catch (e) {
      if ((e as any)?.name === "AbortError") throw e;
      continue;
    }
  }
  throw new Error(`All candidates failed/404:\n${paths.join("\n")}`);
}

// 友善年級文字
function fmtGrade(g?: string) {
  const m = /grade\s*(\d+)/i.exec(g || "");
  if (m) return `小${["一","二","三","四","五","六"][Number(m[1]) - 1] ?? m[1]}`;
  return g ?? "";
}

export default function PacksPage() {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const base = normBase(import.meta.env.VITE_API_BASE as string | undefined);
        const direct = "https://study-game-back.onrender.com";
        const candidates = dedupe([
          base && `${base}/packs`,
          base && `${base}/api/packs`,
          `${direct}/packs`,
          `${direct}/api/packs`,
        ]);

        const data = await fetchFirstOk<Pack[] | { packs: Pack[] }>(candidates, ac.signal);
        const list = Array.isArray(data) ? data : data?.packs ?? [];

        // 可選：排序 + 付費 fallback
        list.sort((a, b) => {
          const ra = CUSTOM_ORDER[a.slug] ?? 9999;
          const rb = CUSTOM_ORDER[b.slug] ?? 9999;
          return ra - rb || a.slug.localeCompare(b.slug);
        });
        for (const it of list) {
          if (typeof it.isPaid !== "boolean") it.isPaid = PAID_SLUGS.has(it.slug);
        }

        setPacks(list);
      } catch (e: any) {
        if (e?.name !== "AbortError") setError(String(e?.message || e));
      } finally {
        setLoading(false);
      }
    })();

    return () => ac.abort();
  }, []);

  if (loading) return <div className="p-8">Loading packs…</div>;
  if (error) return <div className="p-8 text-red-600">Error: {error}</div>;
  if (!packs.length) return <div className="p-8">No packs found.</div>;

  return (
    <div className="p-8">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Packs</h1>
        <Link to="/pricing" className="rounded-xl border px-3 py-1.5 text-sm hover:bg-gray-50">
          了解付費方案
        </Link>
      </div>

      <ul className="space-y-2">
        {packs.map((p) => (
          <li key={p.slug} className="flex items-center justify-between rounded-lg border p-3 hover:bg-gray-50">
            <div>
              <Link to={`/quiz?slug=${encodeURIComponent(p.slug)}`} className="underline">
                {TITLE_FALLBACK[p.slug] ?? p.title ?? p.slug}
              </Link>
              <div className="text-sm text-gray-500">
                {[p.subject, fmtGrade(p.grade)].filter(Boolean).join(" · ")}
              </div>
            </div>

            {typeof p.isPaid === "boolean" && (
              <span
                className={
                  "ml-3 rounded-full px-3 py-1 text-xs " +
                  (p.isPaid ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700")
                }
                title={p.isPaid ? "此題包包含付費功能" : "免費題包"}
              >
                {p.isPaid ? "付費" : "免費"}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
