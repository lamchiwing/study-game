import React, { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";

type Pack = {
  slug: string;
  title?: string;
  subject?: string;
  grade?: string;
  isPaid?: boolean;
};

// ---------- 中文對照 ----------
const SUBJECT_MAP: Record<string, string> = {
  chinese: "中文",
  math: "數學",
  english: "英文",
  general: "常識",
};

const GRADE_MAP: Record<string, string> = {
  grade1: "小一",
  grade2: "小二",
  grade3: "小三",
  grade4: "小四",
  grade5: "小五",
  grade6: "小六",
};

// ---------- 中文標題 fallback ----------
const TITLE_FALLBACK: Record<string, string> = {
  "chinese/grade1/mixed-chi3-demofixed": "混合題（chi3）",
  "chinese/grade1/mixed-colored-demo": "顏色混合示例",
  "math/grade1/20l": "1–20（初階）",
  "math/grade1/20m": "1–20（中階）",
  "math/grade1/20h": "1–20（高階）",
  "Maths/grade1/21-100/l": "21–100（初階）",
  "Maths/grade1/21-100/m": "21–100（中階）",
  "Maths/grade1/21-100/h": "21–100（高階）",
};

// ---------- 主題色 ----------
const SUBJECT_COLOR: Record<string, string> = {
  chinese: "from-rose-100 to-red-200",
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
  const [query, setQuery] = useState(""); // 🔍 搜尋欄

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/api/packs`);
        const data = await res.json();
        setPacks(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error(err);
        setPacks([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // 🔍 搜尋邏輯
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return packs;
    return packs.filter((p) => {
      const subjZh = SUBJECT_MAP[p.subject ?? ""] || "";
      const gradeZh = GRADE_MAP[p.grade ?? ""] || "";
      const fullText = `${p.slug} ${subjZh} ${gradeZh} ${p.title}`.toLowerCase();
      return fullText.includes(q);
    });
  }, [packs, query]);

  if (loading) return <div className="p-6 text-center text-gray-500">載入中…</div>;
  if (!packs.length) return <div className="p-6 text-center">目前沒有題包。</div>;

  // 分層整理：科目 → 年級 → 題包
  const grouped: Record<string, Record<string, Pack[]>> = {};
  for (const p of filtered) {
    const subj = p.subject?.toLowerCase() || "other";
    const grade = p.grade?.toLowerCase() || "unknown";
    grouped[subj] ??= {};
    grouped[subj][grade] ??= [];
    grouped[subj][grade].push(p);
  }

  return (
    <div className="p-6 space-y-8">
      {/* 頂部列 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-2xl font-bold text-center sm:text-left">📚 題庫清單</h1>
        <Link
          to="/pricing"
          className="rounded-xl border px-4 py-2 text-sm text-center hover:bg-gray-50"
        >
          💎 了解付費方案
        </Link>
      </div>

      {/* 🔍 搜尋欄 */}
      <div className="max-w-md mx-auto mb-6">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜尋：如『中文 小一』或『21–100』"
          className="w-full rounded-xl border px-4 py-2 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        {query && (
          <div className="text-sm text-gray-500 mt-1 text-center">
            共找到 {filtered.length} 個題包
          </div>
        )}
      </div>

      {/* 顯示各科別 */}
      {Object.entries(grouped).map(([subject, grades]) => (
        <div key={subject} className="space-y-6">
          <h2 className="text-xl font-bold text-gray-800 border-b-2 pb-1">
            {SUBJECT_MAP[subject] || subject}
          </h2>

          {Object.entries(grades).map(([grade, list]) => (
            <div key={grade} className="space-y-3">
              <h3 className="text-lg font-semibold text-gray-600">
                {GRADE_MAP[grade] || grade}
              </h3>

              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                {list.map((p: any) => {
                  const name =
                    TITLE_FALLBACK[p.slug] || p.title || p.slug.split("/").pop();
                  const color =
                    SUBJECT_COLOR[p.subject ?? ""] || "from-gray-100 to-gray-200";
                  return (
                    <motion.div
                      key={p.slug}
                      whileHover={{ scale: 1.04 }}
                      whileTap={{ scale: 0.98 }}
                      className={`rounded-2xl bg-gradient-to-br ${color} p-4 shadow-sm hover:shadow-md transition`}
                    >
                      <div className="flex flex-col justify-between h-full">
                        <div className="text-lg font-bold text-gray-800 mb-2">
                          {name}
                        </div>
                        <div className="text-sm text-gray-600 mb-3">
                          {SUBJECT_MAP[p.subject ?? ""]}｜{GRADE_MAP[p.grade ?? ""]}
                        </div>
                        <Link
                          to={`/quiz?slug=${encodeURIComponent(p.slug)}`}
                          className="inline-block rounded-lg bg-black text-white text-center py-1.5 hover:bg-gray-800 transition"
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
        </div>
      ))}
    </div>
  );
}
