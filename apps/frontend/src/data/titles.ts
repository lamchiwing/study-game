// apps/frontend/src/data/titles.ts

/** 將任何 slug 規整成統一格式：
 *  - 小寫
 *  - 反斜線→斜線、連續斜線壓成單一
 *  - 去頭尾斜線
 *  - 同義詞：maths→math、ch→chinese、chi→chinese、cn→chinese、zh→chinese
 *  - 年級統一為 gradeN（p1/g1/primary1/year1 → grade1）
 */
export function normalizeSlug(input?: string): string {
  let s = String(input ?? "").trim();

  s = s.replace(/\\/g, "/").replace(/\/{2,}/g, "/").replace(/^\/|\/$/g, "");
  s = s.toLowerCase();

  // 拆片段以便逐一標準化
  const parts = s.split("/").filter(Boolean);
  const out: string[] = [];

  const subjAlias: Record<string, string> = {
    maths: "math",
    mathematics: "math",
    math: "math",
    chinese: "chinese",
    chi: "chinese",
    ch: "chinese",
    cn: "chinese",
    zh: "chinese",
    eng: "english",
    en: "english",
  };

  function toGrade(tok: string): string | "" {
    let t = tok;
    for (const pre of ["grade", "g", "p", "primary", "yr", "year"]) {
      if (t.startsWith(pre)) {
        t = t.slice(pre.length);
        break;
      }
    }
    const num = parseInt(t.replace(/\D+/g, ""), 10);
    return num >= 1 && num <= 6 ? `grade${num}` : "";
  }

  for (const tokRaw of parts) {
    const tok = tokRaw.trim();
    const g = toGrade(tok);
    if (g) {
      out.push(g);
      continue;
    }
    if (subjAlias[tok]) {
      out.push(subjAlias[tok]);
      continue;
    }
    out.push(tok);
  }

  return out.join("/");
}

/** 科目中文對照（接受 alias 或原值） */
export function subjectZh(subject?: string): string {
  const s = (subject ?? "").toLowerCase();
  const key = {
    maths: "math",
    mathematics: "math",
    chi: "chinese",
    ch: "chinese",
    cn: "chinese",
    zh: "chinese",
    eng: "english",
    en: "english",
  }[s] || s;

  const map: Record<string, string> = {
    chinese: "中文",
    math: "數學",
    english: "英文",
    general: "常識",
  };
  return map[key] ?? subject ?? "";
}

/** 年級中文（grade1..grade6 → 小一..小六；也接受 p1/g1/year1/primary1） */
export function gradeZh(g?: string): string {
  const s = (g ?? "").toLowerCase();
  let n = 0;

  const m1 = /grade\s*(\d)/.exec(s);
  if (m1) n = parseInt(m1[1], 10);
  if (!n) {
    const m2 = /(p|g|yr|year|primary)\s*(\d)/.exec(s);
    if (m2) n = parseInt(m2[2], 10);
  }
  if (!n) n = parseInt(s.replace(/\D+/g, ""), 10) || 0;

  const zh = ["一", "二", "三", "四", "五", "六"][n - 1];
  return zh ? `小${zh}` : g ?? "";
}

/** 中文標題 fallback（先寫原始 key，稍後會做 normalize 映射） */
const TITLE_FALLBACK_RAW: Record<string, string> = {
  "chinese/grade1/mixed-chi3-demofixed": "混合題（chi3）",
  "chinese/grade1/mixed-colored-demo": "顏色混合示例",

  "math/grade1/20l": "1–20（初階）",
  "math/grade1/20m": "1–20（中階）",
  "math/grade1/20h": "1–20（高階）",

  "math/grade1/h": "基礎數學（高階）",
  // 21–100 三個等級（不論 math 或 maths，上層 normalize 會統一）
  "math/grade1/21-100/l": "21–100（初階）",
  "math/grade1/21-100/m": "21–100（中階）",
  "math/grade1/21-100/h": "21–100（高階）",

};

/** 轉為 normalize 後的查找表 */
const TITLE_FALLBACK: Record<string, string> = Object.fromEntries(
  Object.entries(TITLE_FALLBACK_RAW).map(([k, v]) => [normalizeSlug(k), v])
);

/** 由 slug 取得中文標題（若無對照，回傳 undefined） */
export function titleFromSlug(slug?: string): string | undefined {
  const key = normalizeSlug(slug);
  return TITLE_FALLBACK[key];
}
