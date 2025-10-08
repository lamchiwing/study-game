// apps/frontend/src/lib/api.ts
export type Question = {
  id?: string | number;
  // 基本欄位
  type?: string;
  question?: string;  // or stem
  explain?: string;
  image?: string;

  // MCQ
  choices?: string[];
  choiceA?: string;
  choiceB?: string;
  choiceC?: string;
  choiceD?: string;
  answer?: string;

  // Fill
  answers?: string | string[];

  // Match（全部透傳，交給 QuizPage 的 normalizeOne 處理）
  pairs?: unknown;           // string | Array<{left:string; right:string}> | object
  left?: string | string[];
  right?: string | string[];
  answerMap?: string | number[]; // 可能是 "0|1|2" 或 [0,1,2]

  // 其他任何後端附帶欄位
  [k: string]: any;
};

function normBase(s?: string) {
  let b = (s ?? "").trim();
  b = b.replace(/^['"]|['"]$/g, ""); // 去意外引號
  b = b.replace(/\/+$/, "");         // 去尾斜線
  const m = b.match(/^(https?:\/\/[^/]+)(?:\/https?:\/\/[^/]+)?$/);
  return m ? m[1] : b;
}
const dedupe = (arr: string[]) => Array.from(new Set(arr.filter(Boolean)));

export async function fetchQuestions(
  slug: string
): Promise<{ list: Question[]; usedUrl?: string; debug?: string }> {
  const base = normBase(import.meta.env.VITE_API_BASE as string | undefined);
  const direct = "https://study-game-back.onrender.com";
  const q = `quiz?slug=${encodeURIComponent(slug)}`;

  const urls = dedupe([
    base && `${base}/${q}`,
    base && `${base}/api/${q}`,
    `${direct}/${q}`,
    `${direct}/api/${q}`,
  ]) as string[];

  let lastErr = "";
  for (const url of urls) {
    try {
      const r = await fetch(url, { credentials: "omit" });
      if (r.status === 404) { lastErr = `404 @ ${url}`; continue; }
      if (!r.ok)           { lastErr = `${r.status} @ ${url}`; continue; }

      // 有些時候後端 header 不標 JSON → 以文字讀入再 JSON.parse
      const text = await r.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch (e) {
        lastErr = `JSON parse failed @ ${url}: ${String(e)} ; sample=${text.slice(0,200)}`;
        continue;
      }

      // 相容三種格式：直接陣列 / {list:[]} / {questions:[]}
      const rawList =
        Array.isArray(data) ? data :
        Array.isArray(data?.list) ? data.list :
        Array.isArray(data?.questions) ? data.questions :
        null;

      if (!Array.isArray(rawList)) {
        return {
          list: [],
          usedUrl: url,
          debug: `No array in payload (keys: ${Object.keys(data || {}).join(",")})`,
        };
      }

      // 不做任何壓縮或欄位改名，**原樣透傳**給 QuizPage 的 normalizeOne
      return { list: rawList as Question[], usedUrl: url, debug: data?.debug };
    } catch (e) {
      lastErr = `Network error @ ${url}: ${String(e)}`;
      continue;
    }
  }

  console.warn("[fetchQuestions] all candidates failed:", lastErr);
  return { list: [], usedUrl: undefined, debug: lastErr };
}
