import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

type Pack = { slug: string; title?: string; subject?: string; grade?: string };

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
      .then((data) => setPacks(data ?? []))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 24 }}>Loading packs…</div>;
  if (error) return <div style={{ padding: 24, color: "crimson" }}>Error: {error}</div>;
  if (!packs.length) return <div style={{ padding: 24 }}>No packs found.</div>;

  
  return (
    <div className="p-8">
     <h1 className="text-2xl font-semibold mb-4">Packs</h1>
    <div style={{ padding: 24 }}>
      <h1>Packs</h1>
      <ul style={{ lineHeight: 2 }}>
        {packs.map((p) => (
          <li key={p.slug}>
            <Link to={`/quiz?slug=${encodeURIComponent(p.slug)}`}>
              {p.title ?? p.slug} {p.subject ? `· ${p.subject}` : ""} {p.grade ? `· ${p.grade}` : ""}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
