// apps/frontend/src/pages/PacksPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { titleFromSlug, subjectZh, gradeZh, normalizeSlug, canonGrade } from "../data/titles";

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

// 將 BASE 清乾淨（移除結尾斜線；避免被 proxy 雙域名包住）
function normBase(s?: string) {
  let b = (s ?? "").trim().replace(/^['"]|['"]$/g, "").replace(/\/+$/, "");
  const m = b.match(/^(https?:\/\/[^/]+)(?:\/https?:\/\/[^/]+)?$/);
  return m ? m[1] : b;
}
const API_BASE =
  normBase(import.meta.env.VITE_API_BASE as string | undefined) ||
  "https://study-game-back.onrender.com";

// —— 同義詞歸一（科目） —— //
function canonSubject(x?: string) {
  const s = String(x || "").toLowerCase();
  if (["math", "maths", "mathematics"].includes(s)) return "math";
  if (["chinese", "cn", "chi", "zh"].includes(s)) return "chinese";
  if (["english", "en"].includes(s)) return "english";
  if (["general", "gs", "gen"].includes(s)) return "general";
  return s;
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
        const r = await fetch(`${API_BASE}/api/packs`);
        const raw = await r.json();

        const rows: any[] = Array.isArray(raw) ? raw : raw?.packs || raw?.items || [];
        const seen = new Set<string>();
        const cleaned: Pack[] = [];

        for (const x of rows) {
          if (!x?.slug) continue;

          const norm = normalizeSlug(String(x.slug));              // 規範化 slug
          const [s0, g0] = norm.split("/").filter(Boolean);        // 由 slug 抽出 subj/grade
          const subj = canonSubject(x.subject ?? s0);              // 科目同義詞歸一
          const grade = canonGrade(x.grade ?? g0);                 // 年級正規化

          // 只接收合法年級，並用 slug 去重
          if (!/^grade[1-6]$/.test(grade)) continue;
          if (seen.has(norm)) continue;
          seen.add(norm);

          cleaned.push({ ...x, slug: norm, subject: subj, grade });
        }

        if (!alive) return;
        setPacks(cleaned);
      } catch (e: any) {
        if (!alive) return;
        setError(String(e?.message || e));
        setPacks([]);
      } finally {
        alive && setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // —— 搜尋 —— //
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return packs;
    return packs.filter((p) => {
      const subjCn = subjectZh(p.subject ?? "").toLowerCase(); // 中文科目
      const grdCn = gradeZh(p.grade ?? "").toLowerCase();      // 中文年級
      const t = (p.title ?? "").toLowerCase();
      const full = `${p.slug} ${p.subject} ${p.grade} ${subjCn} ${grdCn} ${t}`;
      return full.includes(q);
    });
  }, [packs, query]);

  // —— 分組：Subject → Grade —— //
  const grouped = useMemo(() => {
    const m: Record<string, Record<string, Pack[]>> = {};
    for (const p of filtered) {
      const s = canonSubject(p.subject);
      const g = canonGrade(p.grade);
      if (!m[s]) m[s] = {};
      if (!m[s][g]) m[s][g] = [];
      m[s][g].push(p);
    }
    // 每個年級內按 slug 排序，避免卡片跳動
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

  // 年級排序
  const gradeOrder = ["grade1", "grade2", "grade3", "grade4", "grade5", "grade6"];
  const sortGrades = (a: string, b: string) => gradeOrder.indexOf(a) - gradeOrder.indexOf(b);

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

        // 年級排序
        const grades = Object.keys(byGrade).sort(sortGrades);

        return (
          <section key={subj} className="space-y-4">
            <h2 className="border-b pb-1 text-xl font-bold text-gray-800">{subjName}</h2>

            {/* 年級層（單一，避免重複） */}
            {grades.map((grd) => (
              <div key={`${subj}-${grd}`} className="space-y-3">
                <h3 className="text-lg font-semibold text-gray-600">
                  {gradeZh(grd) || grd || "年級"}
                </h3>

                <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                  {byGrade[grd].map((p) => {
                    const key = normalizeSlug(p.slug || ""); // 謹慎再規範一次
                    const parts = key.split("/").filter(Boolean);
                    const subjFromSlug = parts[0] || "";
                    const gradeFromSlug = parts[1] || "";

                    // 顯示名稱：fallback → CSV title → prettified 最後段 → 原 slug
                    const nice =
                      titleFromSlug(key) ||
                      (p.title || "").trim() ||
                      (parts[parts.length - 1] || "")
                        .replace(/[-_]+/g, " ")
                        .replace(/\b\w/g, (m) => m.toUpperCase()) ||
                      p.slug;

                    return (
                      <motion.div
                        key={key}
                        whileHover={{ scale: 1.04 }}
                        whileTap={{ scale: 0.98 }}
                        className={`rounded-2xl bg-gradient-to-br ${color} p-4 shadow-sm transition hover:shadow-md`}
                      >
                        <div className="flex h-full flex-col justify-between">
                          <div className="mb-2 text-lg font-bold text-gray-800">{nice}</div>
                          <div className="mb-3 text-sm text-gray-600">
                            {subjectZh(p.subject || subjFromSlug)}｜{gradeZh(p.grade || gradeFromSlug)}
                          </div>
                          <Link
                            to={`/quiz?slug=${encodeURIComponent(key)}`} // 一律用規範化 slug
                            className="inline-block rounded-lg bg-black px-3 py-1.5 text-center text-white transition hover:bg-gray-800"
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
