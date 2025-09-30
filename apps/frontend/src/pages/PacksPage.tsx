// apps/frontend/src/pages/PacksPage.tsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

type Pack = { slug: string; title?: string; subject?: string; grade?: string };

// 小工具：依序嘗試多個候選 URL，第一個 200/OK 就用
async function fetchFirstOk<T = any>(paths: string[]): Promise<T> {
  for (const url of paths) {
    try {
      const r = await fetch(url);
      if (r.ok) return r.json();
      if (r.status === 404) continue; // 試下一個候選
      throw new Error(`HTTP ${r.status} @ ${url}`);
    } catch {
      // 網路層錯誤（例如 DNS/連線）→ 試下一個候選
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
    const BASE =
      (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, "") ?? "";
    const candidates = [
      `${BASE}/packs`,
      `${BASE}/api/packs`,
      // 保險：即使 .env 沒設好也能吃到資料
      "https://study-game-back.onrender.com/packs",
      "https://study-game-back.onrender.com/api/packs",
    ].filter(Boolean);

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
            <Link
              to={`/quiz?slug=${encodeURIComponent(p.slug)}`}
              className="underline"
            >
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
