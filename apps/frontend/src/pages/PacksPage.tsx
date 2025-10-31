// apps/frontend/src/pages/PacksPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";

/* =========================
   型別
========================= */
type Pack = {
  slug: string;
  title?: string;
  subject?: string;
  grade?: string;
  isPaid?: boolean;
};

/* =========================
   工具：slug 正規化
   - 全小寫
   - 冒號/反斜線 → 斜線
   - 移除頭尾/重複斜線
========================= */
function normalizeSlug(raw?: string): string {
  const s = String(raw || "");
  return s
    .replace(/\\/g, "/")
    .replace(/:+/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\/|\/$/g, "")
    .toLowerCase();
}

/* =========================
   中文對照
========================= */
const SUBJECT_MAP: Record<string, string> = {
  chinese: "中文",
  math: "數學",
  maths: "數學",
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

/* =========================
   中文標題 fallback（key 一律用 normalizeSlug 後的字串）
========================= */
const TITLE_FALLBACK_RAW: Record<string, string> = {
  "chinese/grade1/mixed-chi3-demofixed": "混合題（chi3）",
  "chinese/grade1/mixed-colored-demo": "顏色混合示例",
  "math/grade1/20l": "1–20（初階）",
  "math/grade1/20m": "1–20（中階）",
  "math/grade1/20h": "1–20（高階）",
  "math/grade1/21-100/l": "21–100（初階）",
  "math/grade1/21-100/m": "21–100（中階）",
  "math/grade1/21-100/h": "21–100（高階）",
  // 兼容你曾用的 "Maths/..." 以及大小寫/冒號
  "math/grade1/21-100/l": "21–100（初階）",
  "math/grade1/21-100/m": "21–100（中階）",
  "math/grade1/21-100/h": "21–100（高階）",
};
// 轉成正規化後的映射表
const TITLE_FALLBACK: Record<string, string> = Object.fromEntries(
  Object.entries(TITLE_FALLBACK_RAW).map(([k, v]) => [normalizeSlug(k), v])
);
// 依 slug 取 title（先 fallback，再回傳 undefined）
function titleFromSlug(slug?: string) {
  return TITLE_FALLBACK[normalizeSlug(slug)];
}
// slug 最後一段轉成簡單可讀字
function prettyFromSlug(slug?: string): string {
  const s = normalizeSlug(slug);
  const last = s.split("/").filter(Boolean).pop() || s;
  return last.replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

/* =========================
   主題色
========================= */
const SUBJECT_COLOR: Record<string, string> = {
  chinese: "from-rose-100 to-red-200",
  math: "from-sky-100 to-blue-200",
  maths: "from-sky-100 to-blue-200",
  english: "from-amber-100 to-yellow-200",
  general: "from-lime-100 to-green-200",
};

/* =========================
   API Base
========================= */
const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/+$/, "") ||
  "https://study-game-back.onrender.com";

/* =========================
   主組件
========================= */
export default function PacksPage() {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // 後端同時支援 /packs 與 /api/packs，這裡用 /api/packs
        const res = await fetch(`${API_BASE}/api/packs`);
        const data = await res.json();
        const list: Pack[] = Array.isArray(data) ? data : data?.packs ?? [];
        setPacks(list);
      } catch (e) {
        console.error(e);
        setPacks([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // 🔍 搜尋
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return packs;
    return packs.filter((p) => {
      const slugN = normalizeSlug(p.slug);
      const subjZh = SUBJECT_MAP[(p.subject || "").toLowerCase()] || "";
      const gradeZh = GRADE_MAP[(p.grade || "").toLowerCase()] || "";
      const name = titleFromSlug(slugN) || p.title || prettyFromSlug(slugN);
      const hay = [slugN, subjZh, gradeZh, name].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [packs, query]);

  if (loading) return <div className="p-6 text-center text-gray-500">載入中…</div>;
  if (!packs.length) return <div className="p-6 text-center">目前沒有題包。</div>;

  // 分層：科目 → 年級
  const grouped = filtered.reduce<Record<string, Record<string, Pack[]>>>((acc, p) => {
    const slugN = normalizeSlug(p.slug);
    const [sub0, grd0] = slugN.split("/");
    const subj = (p.subject || sub0 || "others").toLowerCase();
    const grade = (p.grade || grd0 || "unknown").toLowerCase();
    acc[subj] ||= {};
    acc[subj][grade] ||= [];
    acc[subj][grade].push(p);
    return acc;
  }, {});

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-2xl font-bold text-center sm:text-left">📚 題庫清單</h1>
        <Link
          to="/pricing"
          className="rounded-xl border px-4 py-2 text-sm text-center hover:bg-gray-50"
        >
          💎 了解付費方案
        </Link>
      </div>

      {/* 搜尋欄 */}
      <div className="max-w-md mx-auto mb-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜尋：『中文 小一』、『1–20』、『21–100（中階）』…"
          className="w-full rounded-xl border px-4 py-2 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        {query && (
          <div className="mt-1 text-center text-sm text-gray-500">
            共找到 {filtered.length} 個題包
          </div>
        )}
      </div>

      {/* 科目群組 */}
      {Object.entries(grouped).map(([subject, grades]) => (
        <section key={subject} className="space-y-6">
          <h2 className="text-xl font-bold text-gray-800 border-b-2 pb-1">
            {SUBJECT_MAP[subject] || subject}
          </h2>

          {Object.entries(grades).map(([grade, list]) => (
            <div key={grade} className="space-y-3">
              <h3 className="text-lg font-semibold text-gray-600">
                {GRADE_MAP[grade] || grade}
              </h3>

              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                {list.map((p) => {
                  const slugN = normalizeSlug(p.slug);
                  const cardTitle =
                    titleFromSlug(slugN) || p.title || prettyFromSlug(slugN);
                  const color =
                    SUBJECT_COLOR[(p.subject || subject) as string] ||
                    "from-gray-100 to-gray-200";
                  return (
                    <motion.div
                      key={p.slug}
                      whileHover={{ scale: 1.04 }}
                      whileTap={{ scale: 0.98 }}
                      className={`rounded-2xl bg-gradient-to-br ${color} p-4 shadow-sm hover:shadow-md transition`}
                    >
                      <div className="flex h-full flex-col justify-between">
                        <div className="mb-2 text-lg font-bold text-gray-800">
                          {cardTitle}
                        </div>
                        <div className="mb-3 text-sm text-gray-600">
                          {(SUBJECT_MAP[(p.subject || subject) as string] ||
                            subject) +
                            "｜" +
                            (GRADE_MAP[(p.grade || grade) as string] || grade)}
                        </div>
                        <Link
                          to={`/quiz?slug=${encodeURIComponent(p.slug)}`}
                          className="inline-block rounded-lg bg-black py-1.5 text-center text-white hover:bg-gray-800 transition"
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
      ))}
    </div>
  );
}
