// apps/frontend/src/lib/api.ts
export type Question = {
  id?: string | number;
  question: string;
  choices?: string[];
  choiceA?: string;
  choiceB?: string;
  choiceC?: string;
  choiceD?: string;
  answer?: string;
  explain?: string;
  image?: string;
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
      if (r.status === 404) {
        lastErr = `404 @ ${url}`;
        continue;
      }
      if (!r.ok) {
        lastErr = `${r.status} @ ${url}`;
        continue;
      }
      // 有些時候後端 header 不標 JSON，也先取純文字再嘗試 parse
      const text = await r.text();
      try {
        const data = JSON.parse(text);
        const arr = Array.isArray(data) ? data : data?.questions;
        if (!Array.isArray(arr)) return { list: [], usedUrl: url, debug: "No array in payload" };
        // 正規化 choiceA..D -> choices[]
        const list = arr.map((raw: any, i: number) => {
          const choices = Array.isArray(raw.choices)
            ? raw.choices
            : ["choiceA","choiceB","choiceC","choiceD"].map(k => raw[k]).filter(Boolean);
          return {
            id: raw.id ?? i,
            question: raw.question ?? raw.stem ?? "",
            choices,
            choiceA: raw.choiceA, choiceB: raw.choiceB, choiceC: raw.choiceC, choiceD: raw.choiceD,
            answer: raw.answer, explain: raw.explain, image: raw.image
          } as Question;
        });
        return { list, usedUrl: url };
      } catch (e) {
        // JSON 解析失敗，附上前 200 字 debug
        lastErr = `JSON parse failed @ ${url}: ${String(e)} ; sample=${text.slice(0,200)}`;
        continue;
      }
    } catch (e) {
      lastErr = `Network error @ ${url}: ${String(e)}`;
      continue;
    }
  }
  // 全部失敗 → 回空陣列，附 debug
  console.warn("[fetchQuestions] all candidates failed:", lastErr);
  return { list: [], usedUrl: undefined, debug: lastErr };
}
