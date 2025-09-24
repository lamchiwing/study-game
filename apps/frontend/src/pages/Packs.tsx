import { useEffect, useState } from "react";
import { fetchPacks, type Pack } from "../lib/api";

export default function Packs() {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchPacks().then(setPacks).finally(() => setLoading(false)); }, []);

  if (loading) return <div className="p-6">Loading…</div>;
  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Study Game 題包</h1>
      <ul className="space-y-3">
        {packs.map(p => (
          <li key={p.slug} className="p-4 rounded-xl shadow flex items-center justify-between">
            <div>
              <div className="font-semibold">{p.slug}</div>
              <div className="text-sm opacity-70">題數：{p.count ?? "—"}</div>
            </div>
            <a className="px-3 py-2 rounded-xl border" href={`/quiz?slug=${encodeURIComponent(p.slug)}`}>開始</a>
          </li>
        ))}
      </ul>
    </div>
  );
}
