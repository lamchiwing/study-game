// apps/frontend/src/lib/api.ts

export type Question = {
  id?: string | number;

  // 基本欄位
  type?: string;
  question?: string; // or stem
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
  pairs?: unknown;               // string | Array<{left:string; right:string}> | object
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

  // 有些情況 env 可能意外變成 "https://a.com/https://a.com" -> 修正
  const m = b.match(/^(https?:\/\/[^/]+)(?:\/https?:\/\/[^/]+)?$/);
  return m ? m[1] : b;
}

const dedupe = (arr: string[]) => Array.from(new Set(arr.filter(Boolean)));

type FetchOpts = {
  n?: number;        // 精確抽幾題（>0 時優先）
  nmin?: number;     // 隨機下限（含）
  nmax?: number;     // 隨機上限（含）
  seed?: string;     // 決定性洗牌種子
  timeoutMs?: number; // 網路逾時（毫秒）
};

async function fetchWithTimeout(url: string, timeoutMs: number) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { credentials: "omit", signal: ctrl.signal });
    return r;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Fetch quiz questions from backend.
 * Tries multiple candidate URLs:
 * - {base}/quiz?...
 * - {base}/api/quiz?...
 * - direct fallback: https://study-game-back.onrender.com/(api/)quiz?...
 */
export async function fetchQuestions(
  slug: string,
  opts?: FetchOpts
): Promise<{ list: Question[]; usedUrl?: string; debug?: string }> {
  const direct = "https://study-game-back.onrender.com";

  // ✅ 改：env 可能為空，所以 base 允許空；若空就只用 direct
  const envBaseRaw = (import.meta as any)?.env?.VITE_API_BASE as string | undefined;
  const base = normBase(envBaseRaw);

  // 組 query：slug +（可選）n/nmin/nmax/seed
  const params = new URLSearchParams({ slug });

  if (opts?.n && Number.isFinite(opts.n) && opts.n > 0) params.set("n", String(opts.n));
  if (opts?.nmin !== undefined && Number.isFinite(opts.nmin)) params.set("nmin", String(opts.nmin));
  if (opts?.nmax !== undefined && Number.isFinite(opts.nmax)) params.set("nmax", String(opts.nmax));
  if (opts?.seed) params.set("seed", String(opts.seed));

  const q = `quiz?${params.toString()}`;

  // ✅ 改：如果 base 係空，就唔塞入 urls（避免產生 "undefined/quiz"）
  const urls = dedupe([
    base ? `${base}/${q}` : "",
    base ? `${base}/api/${q}` : "",
    `${direct}/${q}`,
    `${direct}/api/${q}`,
  ]) as string[];

  const timeoutMs = opts?.timeoutMs && opts.timeoutMs > 0 ? opts.timeoutMs : 12000;

  let lastErr = "";
  for (const url of urls) {
    try {
      const r = await fetchWithTimeout(url, timeoutMs);

      if (r.status === 404) {
        lastErr = `404 @ ${url}`;
        continue;
      }
      if (!r.ok) {
        lastErr = `${r.status} @ ${url}`;
        continue;
      }

      // 有些時候後端 header 不標 JSON → 以文字讀入再 JSON.parse
      const text = await r.text();

      let data: any;
      try {
        data = JSON.parse(text);
      } catch (e) {
        lastErr = `JSON parse failed @ ${url}: ${String(e)} ; sample=${text.slice(0, 200)}`;
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
          debug: `No array in payload @ ${url} (keys: ${Object.keys(data || {}).join(",")})`,
        };
      }

      // 原樣透傳；由 QuizPage.normalizeOne 負責強韌解析（含 match 題）
      return {
        list: rawList as Question[],
        usedUrl: url,
        debug: data?.debug ? String(data.debug) : `OK @ ${url} (count=${rawList.length})`,
      };
    } catch (e: any) {
      // AbortError / network error
      const msg = e?.name === "AbortError"
        ? `Timeout ${timeoutMs}ms @ ${url}`
        : `Network error @ ${url}: ${String(e)}`;
      lastErr = msg;
      continue;
    }
  }

  console.warn("[fetchQuestions] all candidates failed:", { lastErr, urls, envBaseRaw });
  return { list: [], usedUrl: undefined, debug: lastErr || "All candidates failed" };
}
