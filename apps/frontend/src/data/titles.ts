// apps/frontend/src/data/titles.ts
export const TITLE_FALLBACK: Record<string, string> = {
  "chinese/grade1/mixed-chi3-demofixed": "小一｜中文｜混合題（chi3）",
  "chinese/grade1/mixed-colored-demo":   "小一｜中文｜顏色混合示例",
  "math/grade1/20l": "小一｜數學｜1–20（初階）",
  "math/grade1/20m": "小一｜數學｜1–20（中階）",
  "math/grade1/20h": "小一｜數學｜1–20（高階）",
  "math/grade1/l":   "小一｜數學｜基礎（初階）",
  "math/grade1/m":   "小一｜數學｜基礎（中階）",
  "math/grade1/h":   "小一｜數學｜基礎（高階）",
};

// 可選：目錄排序共用
export const CUSTOM_ORDER: Record<string, number> = {
  "chinese/grade1/mixed-colored-demo": 0,
  "chinese/grade1/mixed-chi3-demofixed": 1,
  "math/grade1/20l": 2,
  "math/grade1/20m": 3,
  "math/grade1/20h": 4,
  "math/grade1/l": 5,
  "math/grade1/m": 6,
  "math/grade1/h": 7,
};

// 小工具：用 slug 找標題（自動正規化）
export function titleFromSlug(slug: string): string | undefined {
  const key = (slug || "").trim().replace(/^\/+|\/+$/g, "").toLowerCase();
  return TITLE_FALLBACK[key];
}
