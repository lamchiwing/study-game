// apps/frontend/src/data/titles.ts

/** 將年級正規化為 grade1..grade6
 *  - 若本來已是 grade1..6 → 直接回傳，不再替換（避免 graderaderade1）
 *  - 支援 p1/g1/primary1/yr1/year1/grade01… 等寫法
 */
export function canonGrade(x?: string): string {
  let t = String(x || "").trim().toLowerCase();

  // 已經是正確格式時，不要再碰（關鍵）
  if (/^grade[1-6]$/.test(t)) return t;

  // 去空白與符號，避免 grade-01 / year_1 等
  t = t.replace(/\s+/g, "").replace(/[^a-z0-9]/g, "");

  // 把 primary/year/yr 統一為 grade
  t = t.replace(/^(primary|year|yr)/i, "grade");

  // 把 p1 / g1 轉為 grade1
  t = t.replace(/^(?:p|g)0*([1-6])$/i, "grade$1");

  // 把 grade01 → grade1
  t = t.replace(/^grade0*([1-6])$/i, "grade$1");

  return t;
}

/** 將 slug 規格化
 *  - 路徑清理：\ → /、去重複 /、去首尾 /
 *  - 第 1 段科目同義詞歸一
 *  - 第 2 段年級使用 canonGrade（避免重覆套用）
 *  - 其餘段轉小寫、-- 壓成 -
 */
export function normalizeSlug(s: string): string {
  const raw = String(s || "")
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/")
    .replace(/^\/+|\/+$/g, "");
  const parts = raw.split("/").map((p) => p.trim()).filter(Boolean);

  // 第 1 段：科目
  if (parts[0]) {
    const sub = parts[0].toLowerCase();
    if (["maths", "mathematics"].includes(sub)) parts[0] = "math";
    else if (["chinese", "cn", "chi, zh"].includes(sub)) parts[0] = "chinese";
    else if (["english", "en"].includes(sub)) parts[0] = "english";
    else if (["general", "gs", "gen"].includes(sub)) parts[0] = "general";
    else parts[0] = sub;
  }

  // 第 2 段：年級
  if (parts[1]) {
    parts[1] = canonGrade(parts[1]);
  }

  // 其他段小寫、-- → -
  for (let i = 2; i < parts.length; i++) {
    parts[i] = parts[i].toLowerCase().replace(/--+/g, "-");
  }
  return parts.join("/");
}

/** 科目中文名 */
export function subjectZh(subj?: string): string {
  const m: Record<string, string> = {
    chinese: "中文",
    math: "數學",
    english: "英文",
    general: "常識",
  };
  return m[(subj || "").toLowerCase()] ?? (subj || "");
}

/** 年級中文名（接受多種寫法） */
export function gradeZh(grade?: string): string {
  const key = canonGrade(grade);
  const map: Record<string, string> = {
    grade1: "小一",
    grade2: "小二",
    grade3: "小三",
    grade4: "小四",
    grade5: "小五",
    grade6: "小六",
  };
  return map[key] ?? (grade ?? "");
}

/** 中文標題 fallback（key 必須是 normalizeSlug 之後的字串） */
const TITLE_FALLBACK_RAW: Record<string, string> = {
  // 中文 demo
  "chinese/grade1/mixed-chi3-demofixed": "混合題（chi3）",
  "chinese/grade1/mixed-colored-demo": "顏色混合示例",

  // 1–20 三個等級
  "math/grade1/20l": "1–20（初階）",
  "math/grade1/20m": "1–20（中階）",
  "math/grade1/20h": "1–20（高階）",

  // 21–100 三個等級（常見兩種結構：21-100l / 21-100/l）
  "math/grade1/21-100l": "21–100（初階）",
  "math/grade1/21-100m": "21–100（中階）",
  "math/grade1/21-100h": "21–100（高階）",

  // 有些資料源只給一層 l/m/h
  "math/grade1/l": "基礎數學（初階）",
  "math/grade1/m": "基礎數學（中階）",
  "math/grade1/h": "基礎數學（高階）",
};

/** 正規化後的查表 */
const TITLE_FALLBACK: Record<string, string> = Object.fromEntries(
  Object.entries(TITLE_FALLBACK_RAW).map(([k, v]) => [normalizeSlug(k), v])
);

/** 依 slug 取中文顯示標題（找不到時回 undefined） */
export function titleFromSlug(slug?: string): string | undefined {
  const key = normalizeSlug(slug || "");
  return TITLE_FALLBACK[key];
}

/** 把最後一段 slug 變成較好讀的英文（每字首大寫） */
export function prettyFromSlug(s: string): string {
  const last = (normalizeSlug(s) || "").split("/").filter(Boolean).pop() || s;
  return last.replace(/[-_]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

/**（可選）導出表，若其他頁要用 */
export const TITLE_DICT = TITLE_FALLBACK;
