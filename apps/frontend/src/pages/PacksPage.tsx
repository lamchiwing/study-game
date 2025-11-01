// apps/frontend/src/pages/PacksPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { titleFromSlug, subjectZh, gradeZh, normalizeSlug } from "../data/titles";

type Pack = {
  slug: string;
  title?: string;
  subject?: string;
  grade?: string;
  isPaid?: boolean;
};

const SUBJECT_COLOR: Record<string, string> = {
  chinese: "from-rose-100 to-red-200",
  math: "from-sky-100 to-blue-200",
  english: "from-amber-100 to-yellow-200",
  general: "from-lime-100 to-green-200",
};

function normBase(s?: string) {
  let b = (s ?? "").trim().replace(/^['"]|['"]$/g, "").replace(/\/+$/, "");
  const m = b.match(/^(https?:\/\/[^/]+)(?:\/https?:\/\/[^/]+)?$/);
  return m ? m[1] : b;
}
const API_BASE =
  normBase(import.meta.env.VITE_API_BASE as string | undefined) ||
  "https://study-game-back.onrender.com";

function coercePacks(x: any): Pack[] {
  if (Array.isArray(x)) return x;
  if (x && Array.isArray(x.packs)) return x.packs;
  if (x && Array.isArray(x.items)) return x.items;
  return [];
}

export default function PacksPage() {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const base = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/+$/,'') 
          || "https://study-game-back.onrender.com";
        const r = await fetch(`${base}/api/packs`);
        const raw = await r.json();

        const list = (Array.isArray(raw) ? raw : raw?.packs || [])
          .filter((x: any)=>x?.slug)
          .map((x: any) => {
            const norm = normalizeSlug(x.slug);
            const [s,g] = norm.split("/").filter(Boolean);
            return {
              ...x,
              slug: norm,                // ✅ 用正規化後的 slug
              subject: x.subject ?? s,   // 補 subject
              grade: x.grade ?? g,       // 補 grade
            };
          });

        if (!alive) return;
        setPacks(list);
      } catch (e:any) {
        if (!alive) return;
        setError(String(e?.message||e));
        setPacks([]);
      } finally {
        alive && setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);
  
  
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return packs;
    return packs.filter((p) => {
      const subj = subjectZh(p.subject ?? "").toLowerCase();
      const grd = gradeZh(p.grade ?? "").toLowerCase();
      const t = (p.title ?? "").toLowerCase();
      const full = `${p.slug} ${subj} ${grd} ${t}`;
      return full.includes(q);
    });
  }, [packs, query]);

  const grouped = useMemo(() => {
    const m: Record<string, Record<string, Pack[]>> = {};
    for (const p of filtered) {
      const subj = (p.subject ?? "").toLowerCase();
      const grd = (p.grade ?? "").toLowerCase();
      if (!m[subj]) m[subj] = {};
      if (!m[subj][grd]) m[subj][grd] = [];
      m[subj][grd].push(p);
    }
    Object.keys(m).forEach((s) => {
      Object.keys(m[s]).forEach((g) => {
        m[s][g].sort((a, b) => a.slug.localeCompare(b.slug));
      });
    });
    return m;
  }, [filtered]);

  if (loading) return <div className="p-6 text-center text-gray-500">載入中…</div>;
  if (error)
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-700">
          讀取題庫失敗：{error}
        </div>
      </div>
    );
  if (!packs.length) return <div className="p-6 text-center">目前沒有題包。</div>;

  return (
    <div className="p-6 space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">📚 題庫清單</h1>
        <Link to="/pricing" className="rounded-xl border px-3 py-1.5 text-sm hover:bg-gray-50">
          💎 了解付費方案
        </Link>
      </div>

      {/* 搜尋欄 */}
      <div className="mx-auto mb-4 max-w-md">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜尋：如『中文 小一』或『21–100』"
          className="w-full rounded-xl border px-4 py-2 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        {query && (
          <div className="mt-1 text-center text-sm text-gray-500">
            共找到 {filtered.length} 個題包
          </div>
        )}
      </div>

      {/* 科目層 */}
      {Object.entries(grouped).map(([subj, byGrade]) => {
        const color = SUBJECT_COLOR[subj] ?? "from-gray-100 to-gray-200";
        const subjName = subjectZh(subj) || subj || "其他";
        return (
          <section key={subj} className="space-y-4">
            <h2 className="text-xl font-bold text-gray-800 border-b pb-1">{subjName}</h2>

      {/* 年級層 */}
      {Object.entries(byGrade).map(([grd, list]) => (
         <div key={`${subj}-${grd}`} className="space-y-3">
           <h3 className="text-lg font-semibold text-gray-600">
             {gradeZh(grd) || grd || "年級"}
           </h3>

           <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
            {list.map((p) => {
              // 先標準化 slug
              const key = normalizeSlug(p.slug || "");
              const parts = key.split("/").filter(Boolean);
              const subjFromSlug = parts[0] || "";
              const gradeFromSlug = parts[1] || "";

             // 顯示名稱：fallback → CSV title → 最後一段 prettify → 原始 slug
              const nice =
                titleFromSlug(key) ||
                (p.title || "").trim() ||
                (parts[parts.length - 1] || "")
                  .replace(/[-_]+/g, " ")
                  .replace(/\b\w/g, (m) => m.toUpperCase()) ||
                p.slug;

              return (
                <motion.div
                  key={p.slug}
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.98 }}
                  className={`rounded-2xl bg-gradient-to-br ${color} p-4 shadow-sm hover:shadow-md transition`}
              >
                  <div className="flex h-full flex-col justify-between">
                    <div className="mb-2 text-lg font-bold text-gray-800">{nice}</div>

                  <div className="mb-3 text-sm text-gray-600">
                    {subjectZh(p.subject || subjFromSlug)}｜{gradeZh(p.grade || gradeFromSlug)}
                  </div>

                  <Link
                    // 用 normalize 後的 slug 帶去 Quiz，避免路徑不一致
                    to={`/quiz?slug=${encodeURIComponent(key)}`}
                    className="inline-block rounded-lg bg-black px-3 py-1.5 text-center text-white hover:bg-gray-800 transition"
                  >
                    開始練習 ▶
                  </Link>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    ))}

            {/* 年級層 */}
            {Object.entries(byGrade).map(([grd, list]) => (
              <div key={`${subj}-${grd}`} className="space-y-3">
                <h3 className="text-lg font-semibold text-gray-600">{gradeZh(grd) || grd || "年級"}</h3>

                <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                  {list.map((p) => {
                    const nice =
                      titleFromSlug(p.slug) ||
                      p.title ||
                      normalizeSlug(p.slug).split("/").pop()?.replace(/[-_]+/g, " ") ||
                      p.slug;

                    return (
                      <motion.div
                        key={p.slug}
                        whileHover={{ scale: 1.04 }}
                        whileTap={{ scale: 0.98 }}
                        className={`rounded-2xl bg-gradient-to-br ${color} p-4 shadow-sm hover:shadow-md transition`}
                      >
                        <div className="flex h-full flex-col justify-between">
                          <div className="mb-2 text-lg font-bold text-gray-800">{nice}</div>
                          <div className="mb-3 text-sm text-gray-600">
                            {subjectZh(p.subject)}｜{gradeZh(p.grade)}
                          </div>
                          <Link
                            to={`/quiz?slug=${encodeURIComponent(p.slug)}`}
                            className="inline-block rounded-lg bg-black px-3 py-1.5 text-center text-white hover:bg-gray-800 transition"
                          >
                            開始練習 ▶
                          </Link>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}
