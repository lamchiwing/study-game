// apps/frontend/src/data/titles.ts

/** 將 slug 規整成：全小寫、用 / 作分隔、去掉重複斜線 */
export function normalizeSlug(raw?: string): string {
  const s = String(raw || "");
  return s
    .replace(/\\/g, "/")        // 反斜線 → 斜線
    .replace(/:+/g, "/")        // 冒號 → 斜線（你之前上傳造成的情況）
    .replace(/\/+/g, "/")       // 連續斜線合併
    .replace(/^\//, "")         // 去頭尾斜線
    .replace(/\/$/, "")
    .toLowerCase();
}

/** 中文標題 fallback – 注意 key 全部用「normalizeSlug 後的字串」 */
const TITLE_MAP: Record<string, string> = {
  // 中文
  [normalizeSlug("chinese/grade1/mixed-chi3-demofixed")]: "混合題（chi3）",
  [normalizeSlug("chinese/grade1/mixed-colored-demo")]:   "顏色混合示例",

  // 數學 1–20
  [normalizeSlug("math/grade1/20l")]: "1–20（初階）",
  [normalizeSlug("math/grade1/20m")]: "1–20（中階）",
  [normalizeSlug("math/grade1/20h")]: "1–20（高階）",

  // 數學 21–100（同時支援 Maths / math、大小寫與冒號）
  [normalizeSlug("Maths/grade1/21-100/L")]: "21–100（初階）",
  [normalizeSlug("Maths/grade1/21-100/M")]: "21–100（中階）",
  [normalizeSlug("Maths/grade1/21-100/H")]: "21–100（高階）",
  [normalizeSlug("math/grade1/21-100/l")]: "21–100（初階）",
  [normalizeSlug("math/grade1/21-100/m")]: "21–100（中階）",
  [normalizeSlug("math/grade1/21-100/h")]: "21–100（高階）",
};

export function titleFromSlug(slug?: string): string | undefined {
  const key = normalizeSlug(slug);
  return TITLE_MAP[key];
}

/** 後備的人性化標題（沒有 CSV title，也沒有 TITLE_MAP 時用） */
export function prettyFromSlug(slug?: string): string {
  const s = normalizeSlug(slug);
  const parts = s.split("/").filter(Boolean);
  const last = parts[parts.length - 1] || "";
  return last
    .replace(/-/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase()); // 首字母大寫
}

/** 科目/年級中文字 */
export function zhSubject(sub?: string) {
  switch ((sub || "").toLowerCase()) {
    case "chinese": case "cn": case "chi": case "zh":   return "中文";
    case "math": case "maths": case "mathematics":      return "數學";
    case "general": case "gs": case "gen":              return "常識";
    default: return sub || "";
  }
}
export function zhGrade(g?: string) {
  const m = /grade\s*(\d+)/i.exec(g || "");
  if (!m) return g || "";
  const n = Number(m[1]);
  const map = ["一","二","三","四","五","六"];
  return n >= 1 && n <= 6 ? `小${map[n - 1]}` : g || "";
}
