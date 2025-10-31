// apps/frontend/src/pages/PacksPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
// 直接使用你在 ../data/titles 內已做 normalize 的工具
import { titleFromSlug, subjectZh, gradeZh, normalizeSlug } from "../data/titles";

type Pack = {
  slug: string;
  title?: string;
  subject?: string;
  grade?: string;
  isPaid?: boolean;
};

const SUBJECT_COLOR: Record<string, string> = {
  chinese: "from-rose-100 to-rose-200",
  math: "from-sky-100 to-blue-200",
  english: "from-amber-100 to-yellow-200",
  general: "from-lime-100 to-green-200",
};

const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/+$/, "") ||
  "https://study-game-back.onrender.com";

export default function PacksPage() {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        // 後端 /api/packs 會回傳 slug/subject/grade/title
        const r = await fetch(`${API_BASE}/api/packs`);
        const data = await r.json();
        if (!alive) return;
        setPacks(Array.isArray(data) ? data : data?.packs ?? []);
      } catch (e) {
        console.error(e);
        if (!alive) return;
        setPacks([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // 🔍 搜尋（對 slug+中文科目+中文年級+fallback 標題做檢索）
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return packs;

    return packs.filter((p) => {
      const ns = normalizeSlug(p.slug);
      const zhTitle = titleFromSlug(ns) || p.title || ns.split("/").pop() || ns;
      const subj = subjectZh(p.subject || "");
      const grade = gradeZh(p.grade || "");
      const hay = `${ns} ${zhTitle} ${subj} ${grade}`.toLowerCase();
      return hay.includes(q);
    });
  }, [packs, query]);

  if (loading) return <div className="p-6 text-center text-gray-500">載入中…</div>;
  if (!packs.length) return <div className="p-6 text-center">目前沒有題包。</div>;

  // 分層：科目 -> 年級 -> 題包
  const grouped = useMemo(() => {
    const g: Record<string, Record<string, Pack[]>> = {};
    for (const p of filtered) {
      const subj = (p.subject || "").toLowerCase();
      const grade = (p.grade || "").toLowerCase();
      g[subj] ??= {};
      g[subj][grade] ??= [];
      g[subj][grade].push(p);
    }
    // 每層做一點排序：grade1..grade6、slug 自然排序
    for (const subj of Object.keys(g)) {
      const grades = Object.keys(g[subj]).sort((a, b) => {
        const na = parseInt(a.replace(/\D+/g, "") || "0", 10);
        const nb = parseInt(b.replace(/\D+/g, "") || "0", 10);
        return na - nb;
      });
      const sorted: Record<string, Pack[]> = {};
      for (const gr of grades) {
        sorted[gr] = g[subj][gr].slice().sort((A, B) =>
          normalizeSlug(A.slug).localeCompare(normalizeSlug(B.slug))
        );
      }
      g[subj] = sorted;
    }
    return g;
  }, [filtered]);

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">📚 題庫清單</h1>
        <div className="flex gap-2">
          <Link to="/upload" className="rounded-xl border px-4 py-2 text-sm hover:bg-gray-50">
            上載題包
          </Link>
          <Link to="/pricing" className="rounded-xl border px-4 py-2 text-sm hover:bg-gray-50">
            💎 了解付費方案
          </Link>
        </div>
      </div>

      {/* 🔍 Search */}
      <div className="mx-auto mb-2 max-w-md">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜尋：輸入『中文 小一』或『21–100』"
          className="w-full rounded-xl border px-4 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        {query && (
          <div className="mt-1 text-center text-sm text-gray-500">共 {filtered.length} 個結果</div>
        )}
      </div>

      {/* 科目群組 */}
      {Object.entries(grouped).map(([subj, gradeMap]) => {
        const color = SUBJECT_COLOR[subj] || "from-gray-100 to-gray-200";
        return (
          <section key={subj} className="space-y-5">
            <h2 className="text-xl font-bold text-gray-800">{subjectZh(subj) || subj}</h2>

            {Object.entries(gradeMap).map(([gr, list]) => (
              <div key={gr} className="space-y-3">
                <h3 className="text-lg font-semibold text-gray-600">{gradeZh(gr) || gr}</h3>

                <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                  {list.map((p) => {
                    const ns = normalizeSlug(p.slug);
                    const title = titleFromSlug(ns) || p.title || ns.split("/").pop();
                    return (
                      <motion.div
                        key={p.slug}
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.98 }}
                        className={`rounded-2xl bg-gradient-to-br ${color} p-4 shadow-sm transition hover:shadow-md`}
                      >
                        <div className="mb-2 text-lg font-bold text-gray-800">{title}</div>
                        <div className="mb-3 text-sm text-gray-600">
                          {subjectZh(p.subject || "")}｜{gradeZh(p.grade || "")}
                        </div>
                        <Link
                          to={`/quiz?slug=${encodeURIComponent(p.slug)}`}
                          className="inline-block rounded-lg bg-black px-4 py-1.5 text-center text-white transition hover:bg-gray-800"
                        >
                          開始練習 ▶
                        </Link>
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
