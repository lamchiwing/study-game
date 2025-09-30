// apps/frontend/src/pages/PacksPage.tsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

type Pack = {
  slug: string;
  title?: string;
  subject?: string;
  grade?: string;
};

export default function PacksPage() {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const API_BASE = import.meta.env.VITE_API_BASE;
    fetch(`${API_BASE}/packs`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        // 後端可能回 {packs:[...]} 或直接是陣列，兩者都支援
        const list = Array.isArray(data) ? data : data?.packs ?? [];
        setPacks(list);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-8">Loading packs…</div>;
  }

  if (error) {
    return <div className="p-8 text-red-600">Error: {error}</div>;
  }

  if (packs.length === 0) {
    return <div className="p-8">No packs found.</div>;
  }

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
