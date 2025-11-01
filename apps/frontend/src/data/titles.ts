// apps/frontend/src/data/titles.ts

// --- 基礎：科目/年級的中文映射 ---
export const SUBJECT_ZH: Record<string, string> = {
  chinese: "中文",
  math: "數學",
  english: "英文",
  general: "常識",
};
export const GRADE_ZH: Record<string, string> = {
  grade1: "小一",
  grade2: "小二",
  grade3: "小三",
  grade4: "小四",
  grade5: "小五",
  grade6: "小六",
};

// --- 正規化工具：把 slug 統一成小寫、用正斜線分隔 ---
export function normalizeSlug(s?: string): string {
  const t = String(s ?? "").trim();
  if (!t) return "";
  // 把反斜線與連續斜線統一
  const cleaned = t.replace(/\\/g, "/").replace(/\/+/g, "/");
  return cleaned.toLowerCase();
}

// --- 中文標題 fallback（key 要用正規化後的 slug）---
const TITLE_FALLBACK_RAW: Record<string, string> = {
  "chinese/grade1/mixed-chi3-demofixed": "混合題（chi3）",
  "chinese/grade1/mixed-colored-demo": "顏色混合示例",
  "math/grade1/20l": "1–20（初階）",
  "math/grade1/20m": "1–20（中階）",
  "math/grade1/20h": "1–20（高階）",
  // 你上傳到 R2 的路徑是 math，不是 Maths，統一用小寫 math
  "math/grade1/21-100l": "21–100（初階）",
  "math/grade1/21-100m": "21–100（中階）",
  "math/grade1/21-100h": "21–100（高階）",
};

// 產生最終對照表（key 已正規化）
const TITLE_FALLBACK: Record<string, string> = Object.fromEntries(
  Object.entries(TITLE_FALLBACK_RAW).map(([k, v]) => [normalizeSlug(k), v])
);

// --- 由 slug 取顯示用標題（先用 fallback，沒有就 undefined） ---
export function titleFromSlug(slug?: string): string | undefined {
  return TITLE_FALLBACK[normalizeSlug(slug)];
}

// --- 方便在 PacksPage 使用的科目/年級中文函式 ---
export function subjectZh(subj?: string): string {
  return SUBJECT_ZH[(subj || "").toLowerCase()] ?? (subj ?? "");
}
export function gradeZh(grade?: string): string {
  const g = (grade || "").toLowerCase();
  return GRADE_ZH[g] ?? grade ?? "";
}
