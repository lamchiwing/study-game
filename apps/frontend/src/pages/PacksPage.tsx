// apps/frontend/src/pages/PacksPage.tsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

type Pack = { slug: string; title?: string; subject?: string; grade?: string };

// --- 工具：規整 BASE 並去掉重複貼上 ---
function normBase(s: string | undefined) {
  let b = (s ?? "").trim();
  b = b.replace(/^['"]|['"]$/g, ""); // 去掉手滑加的引號
  b = b.replace(/\/+$/, "");         // 去掉所有尾斜線
  // 若變成 https://x/https://x → 只保留第一段
  const m = b.match(/^(https?:\/\/[^/]+)(?:\/https?:\/\/[^/]+)?$/);
  return m ? m[1] : b;
}
const dedupe = (arr: string[]) => Array.from(new Set(arr.filter(Boolean)));

// --- 依序嘗試多個候選 URL，第一個 200/OK 就用 ---
async function fetchFirstOk<T = any>(paths: string[]): Promise<T> {
  for (const url of paths) {
    try {
      const r = await fetch(url);
      if (!r.ok) {
        if (r.status === 404) continue;
        throw new Error(`HTTP ${r.status} @ ${url}`);
      }
      return await r.json(); // 若回來是 HTML，這裡會 throw，被 catch 後改試下一個
    } catch {
      continue;
    }
  }
  throw new Error(`All candidates failed/404:\n${paths.join("\n")}`);
}

export default function PacksPage() {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const base = normBase(import.meta.env.VITE_API_BASE as string | undefined);
    const direct = "https://study-game-back.onrender.com";

    const candidates = dedupe([
      base && `${base}/packs`,
      base && `${base}/api/packs`,
      `${direct}/packs`,
      `${direct}/api/packs`,
    ]);

    fetchFirstOk<Pack[] | { packs: Pack[] }>(candidates)
      .then((data) => {
        const list = Array.isArray(data) ? data : data?.packs ?? [];
        setPacks(list);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8">Loading packs…</div>;
  if (error) return <div className="p-8 text-red-600">Error: {error}</div>;
  if (!packs.length) return <div className="p-8">No packs found.</div>;

  return (
    <div className="p-8">
      <h1 className="mb-4 text-2xl font-semibold">Packs</h1>
      <ul className="space-y-2">
        {packs.map((p) => (
          <li key={p.slug} className="rounded-lg border p-3 hover:bg-gray-50">
            <Link to={`/quiz?slug=${encodeURIComponent(p.slug)}`} className="underline">
              {p.title ?? p.slug}
            </Link>
            <div className="text-sm text-gray-500">
              {[p.subject, p.grade].filter(Boolean).join(" · ")}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
