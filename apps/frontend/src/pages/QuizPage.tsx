import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { fetchQuestions as _fetchQuestions } from "../lib/api";
import { motion, AnimatePresence } from "framer-motion";

/* -----------------------------------------------------------
   BBCode → HTML（含 legacy 標籤 -> [c=token]）
   需在 index.css 設定 :root { --c-ai:..., --c-yamabuki:..., ... }
----------------------------------------------------------- */
function preprocessBBCodeToHTML(input?: string): string {
  let t = input ?? "";

  // legacy → 統一為 [c=token] / [bgc=token]
  t = t
    .replace(/\[red\](.*?)\[\/red\]/gis, "[c=kurenai]$1[/c]")
    .replace(/\[blue\](.*?)\[\/blue\]/gis, "[c=ai]$1[/c]")
    .replace(/\[green\](.*?)\[\/green\]/gis, "[c=wakaba]$1[/c]")
    .replace(/\[yellow\](.*?)\[\/yellow\]/gis, "[c=yamabuki]$1[/c]")
    .replace(/\[orange\](.*?)\[\/orange\]/gis, "[c=orange]$1[/c]")
    .replace(/\[purple\](.*?)\[\/purple\]/gis, "[c=purple]$1[/c]")
    .replace(/\[bgorange\](.*?)\[\/bgorange\]/gis, "[bgc=orange]$1[/bgc]")
    .replace(/\[bgpurple\](.*?)\[\/bgpurple\]/gis, "[bgc=purple]$1[/bgc]");

  // 動態字色 / 底色
  t = t.replace(/\[c=([a-z0-9_-]+)\](.*?)\[\/c\]/gis, (_m, token, body) =>
    `<span style="color:var(--c-${token})">${body}</span>`
  );
  t = t.replace(/\[bgc=([a-z0-9_-]+)\](.*?)\[\/bgc\]/gis, (_m, token, body) =>
    `<span class="jp-bg" data-c="${token}" style="background:var(--c-${token})">${body}</span>`
  );

  // UI 顯示時移除「（測試別名…）」註記
  t = t.replace(/（\s*測試別名[^）]*）/g, "");

  return t;
}

// 純文字（給 <option> 等）
function stripBBCode(input?: string): string {
  const t = preprocessBBCodeToHTML(input);
  return t.replace(/<[^>]+>/g, "").replace(/\[\/?\w+(?:=[^\]]+)?\]/g, "").trim();
}

// 安全渲染
function renderContent(text?: string) {
  if (!text) return null;
  const html = preprocessBBCodeToHTML(text);
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

/* ---------------- 型別 ---------------- */
type Raw = any;
type QBase = { id: string | number; stem: string; image?: string; explain?: string };

type QMCQ = QBase & {
  type: "mcq";
  choices: string[];
  answerLetter?: "A" | "B" | "C" | "D";
  answerText?: string;
};
type QTF = QBase & { type: "tf"; answerBool: boolean };
type QFill = QBase & { type: "fill"; acceptable: string[] };
type QMatch = QBase & { type: "match"; left: string[]; right: string[]; answerMap: number[] };
type NormQ = QMCQ | QTF | QFill | QMatch;

const normStr = (s?: string) => (s ?? "").trim().toLowerCase();
const up = (s?: string) => (s ?? "").trim().toUpperCase();

/* ---------------- 正規化 ---------------- */
function normalizeOne(raw: Raw, i: number): NormQ {
  const typeHint = String(raw.type ?? raw.kind ?? raw.questionType ?? "").toLowerCase();
  const base: QBase = {
    id: raw.id ?? i,
    stem: raw.question ?? raw.stem ?? "",
    image: raw.image,
    explain: raw.explain ?? raw.explanation,
  };

  // 強韌 MATCH 解析：支援 pairs 為字串/陣列/物件，與多鍵名
  if (Array.isArray(raw.pairs) || typeof raw.pairs === "string" || (raw.pairs && typeof raw.pairs === "object")) {
    try {
      let s: any = raw.pairs;

      // 若是字串 → 去殼 / 還原 / 解析（含雙重 JSON、HTML 實體、CSV 轉義、base64）
      if (typeof s === "string") {
        let txt = s.trim();
        if (txt.startsWith("'") && txt.endsWith("'")) txt = txt.slice(1, -1);
        const maybeB64 = /^[A-Za-z0-9+/=\r\n]+$/.test(txt) && txt.length % 4 === 0;
        if (maybeB64) {
          try {
            // atob 在瀏覽器可用
            const decoded = (typeof atob === "function") ? atob(txt.replace(/\s+/g, "")) : txt;
            if (decoded.trim().startsWith("[") || decoded.trim().startsWith("{")) txt = decoded;
          } catch {}
        }
        txt = txt.replace(/&quot;/g, '"').replace(/&#34;/g, '"').replace(/\\"/g, '"').replace(/""/g, '"');
        s = JSON.parse(txt);
        if (typeof s === "string" && s.trim().startsWith("[")) s = JSON.parse(s);
      }

      // 物件形：{ left:[...], right:[...], map/answerMap/index:[...] }
      if (s && typeof s === "object" && !Array.isArray(s)) {
        const leftArr  = s.left  ?? s.Left  ?? s.l ?? s.L;
        const rightArr = s.right ?? s.Right ?? s.r ?? s.R ?? s.value ?? s.values;
        const mapArr   = s.answerMap ?? s.map ?? s.index ?? s.match ?? s.mapping;
        if (Array.isArray(leftArr) && Array.isArray(rightArr)) {
          const left  = leftArr.map(String);
          const right = rightArr.map(String);
          const answerMap = Array.isArray(mapArr)
            ? mapArr.map((n: any) => Number(n))
            : left.map((L: string) => right.findIndex((R: string) => normStr(R) === normStr(L)));
          if (left.length && right.length && answerMap.length === left.length)
            return { ...base, type: "match", left, right, answerMap };
        }
      }

      // 陣列形：[{left,right}]（容忍大小寫與縮寫）
      if (Array.isArray(s)) {
        const pick = (o: any, keys: string[]) => {
          for (const k of keys) if (o && o[k] != null) return o[k];
          return undefined;
        };
        const arr = s
          .map((x) => {
            const L = pick(x, ["left", "Left", "l", "L", "from", "key", "src"]);
            const R = pick(x, ["right", "Right", "r", "R", "to", "value", "dst"]);
            if (L == null || R == null) return null;
            return { left: String(L), right: String(R) };
          })
          .filter(Boolean) as Array<{ left: string; right: string }>;
        if (arr.length) {
          const left = arr.map((p) => p.left);
          const right = arr.map((p) => p.right);
          const answerMap = left.map((L) =>
            right.findIndex((R) => normStr(R) === normStr((arr.find((x) => x.left === L) as any)?.right))
          );
          return { ...base, type: "match", left, right, answerMap };
        }
      }
    } catch {}
  }

  // 備援 1：管線字串 left/right/answerMap
  if ((typeof raw.left === "string" && typeof raw.right === "string") || typeof raw.answerMap === "string") {
    const left = String(raw.left ?? "").split("|").map((s) => s.trim()).filter(Boolean);
    const right = String(raw.right ?? "").split("|").map((s) => s.trim()).filter(Boolean);
    const answerMap = String(raw.answerMap ?? "")
      .split("|").map((s) => s.trim()).filter(Boolean).map(Number);
    if (left.length && right.length && answerMap.length === left.length)
      return { ...base, type: "match", left, right, answerMap };
  }

  // 備援 2：原生陣列（嚴格三欄）
  if (Array.isArray(raw.left) && Array.isArray(raw.right) && Array.isArray(raw.answerMap)) {
    return {
      ...base,
      type: "match",
      left: raw.left.map(String),
      right: raw.right.map(String),
      answerMap: raw.answerMap.map((n: any) => Number(n)),
    };
  }

  // TF
  const A = up(raw.answer);
  if (
    typeHint === "tf" || typeHint === "truefalse" ||
    A === "T" || A === "F" || A === "TRUE" || A === "FALSE" ||
    typeof raw.answerBool === "boolean"
  ) {
    const answerBool = typeof raw.answerBool === "boolean" ? raw.answerBool : A === "T" || A === "TRUE";
    return { ...base, type: "tf", answerBool };
  }

  // FILL
  const hasChoices =
    (Array.isArray(raw.choices) && raw.choices.length > 0) ||
    ["choiceA", "choiceB", "choiceC", "choiceD"].some((k) => raw[k]);
  if (typeHint === "fill" || (!hasChoices && (raw.answer || raw.answers))) {
    const acceptable = Array.isArray(raw.answers)
      ? raw.answers.map(normStr)
      : String(raw.answer ?? "").split("|").map(normStr).filter(Boolean);
    return { ...base, type: "fill", acceptable };
  }

  // MCQ
  const choices: string[] = Array.isArray(raw.choices)
    ? raw.choices
    : ["choiceA", "choiceB", "choiceC", "choiceD"].map((k) => raw[k]).filter(Boolean);
  const letter = up(raw.answer);
  const answerLetter = (["A", "B", "C", "D"] as const).includes(letter as any)
    ? (letter as "A" | "B" | "C" | "D")
    : undefined;
  const answerText = !answerLetter ? String(raw.answer ?? "").trim() : undefined;

  return { ...base, type: "mcq", choices, answerLetter, answerText };
}

function normalizeList(raw: unknown): NormQ[] {
  const list =
    Array.isArray(raw) ? raw :
    Array.isArray((raw as any)?.list) ? (raw as any).list :
    Array.isArray((raw as any)?.questions) ? (raw as any).questions :
    [];
  return list.map(normalizeOne);
}

/* ---------------- 判題 ---------------- */
function isCorrect(q: NormQ, ans: any): boolean {
  switch (q.type) {
    case "mcq":
      if (ans == null || typeof ans !== "number") return false;
      if (q.answerLetter) return "ABCD".indexOf(q.answerLetter) === ans;
      if (q.answerText) return normStr(q.answerText) === normStr(q.choices[ans] ?? "");
      return false;
    case "tf":
      return typeof ans === "boolean" && ans === q.answerBool;
    case "fill":
      return typeof ans === "string" && q.acceptable.includes(normStr(ans));
    case "match":
      return Array.isArray(ans) && ans.every((v, i) => Number(v) === q.answerMap[i]);
  }
}

// ---------------- 抽題工具方法（隨機取 10~15 題） ----------------
function shuffleInPlace<T>(arr: T[]) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
function pickN(list: any[], nMin = 10, nMax = 15) {
  const n = Math.max(nMin, Math.min(nMax, Math.floor(nMin + Math.random() * (nMax - nMin + 1))));
  const copy = list.slice();
  shuffleInPlace(copy);
  return copy.slice(0, Math.min(copy.length, n));
}


/* ---------------- 頁面 ---------------- */
export default function QuizPage() {
  const [sp] = useSearchParams();
  // 取得 slug 時順手去掉前後空白
  const slug = (sp.get("slug") ?? "").trim();
 

  const [questions, setQuestions] = useState<NormQ[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiUrl, setApiUrl] = useState<string | undefined>();
  const SHOW_DEBUG = import.meta.env.DEV;
 

  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<any[]>([]);
  const [done, setDone] = useState(false);

  // 分數動畫：+1 浮現
  const prevScoreRef = useRef(0);
  const [popPlusOne, setPopPlusOne] = useState(false);
  const [packTitle, setPackTitle] = useState<string>(""); 

  useEffect(() => {
    if (!slug) {
      setQuestions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setDone(false);
    (async () => {
      try {
        
        const ret: any = await _fetchQuestions(slug);
        const full = normalizeList(ret?.list ?? ret);

      // 支援網址參數 n，例如 ?n=12
        const nParam = Number(sp.get("n"));
        const subset =
          Number.isFinite(nParam) && nParam > 0
            ? full.slice().sort(() => Math.random() - 0.5).slice(0, nParam)
            : pickN(full, 10, 15);
        
        setApiUrl(ret?.usedUrl);
        setPackTitle(ret?.title || "")
        setQuestions(subset);
        setAnswers(
          subset.map((q) => {              // ✅ 改用 subset
            if (q.type === "mcq") return null;
            if (q.type === "tf") return null;
            if (q.type === "fill") return "";
            if (q.type === "match") return Array((q as QMatch).left.length).fill(null);
            return null;
          })
        );
        
        setIdx(0);
        setApiUrl(ret?.usedUrl);
        setPackTitle(ret?.title || ""); 
      } catch (e: any) {
        console.warn("fetchQuestions failed:", e);
        setQuestions([]);
        setApiUrl(undefined);      
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  // 計分（答對一題 +1）
  const { score, total } = useMemo(() => {
    if (!questions?.length) return { score: 0, total: 0 };
    let s = 0;
    for (let i = 0; i < questions.length; i++) {
      if (isCorrect(questions[i], answers[i])) s += 1;
    }
    return { score: s, total: questions.length };
  }, [questions, answers]);

  // 分數上升觸發 +1 動畫
  useEffect(() => {
    if (score > prevScoreRef.current) {
      setPopPlusOne(true);
      const t = setTimeout(() => setPopPlusOne(false), 600);
      prevScoreRef.current = score;
      return () => clearTimeout(t);
    }
    prevScoreRef.current = score;
  }, [score]);

  // ✅ MCQ：已答就不再改
  const pickMCQ = (i: number) =>
    setAnswers((prev) => {
      if (prev[idx] != null) return prev;        // ← 關鍵：鎖定
      const next = prev.slice();
      next[idx] = i;
      return next;
  });

// ✅ TF：已答就不再改
  const pickTF = (b: boolean) =>
    setAnswers((prev) => {
      if (prev[idx] != null) return prev;        // ← 關鍵：鎖定
      const next = prev.slice();
      next[idx] = b;
      return next;
   });

// ✅ Match：每一列選定後鎖該列（可改成鎖整題，看你需求）
  const pickMatch = (li: number, ri: number | null) =>
    setAnswers((prev) => {
      const cur = prev[idx];
      if (Array.isArray(cur) && cur[li] != null) return prev; // 該列已選，就不改
      const next = prev.slice();
      const arr = (next[idx] as Array<number | null>).slice();
      arr[li] = ri;
      next[idx] = arr;
      return next;
   });

  // ✅ Fill：輸入框處理（預設可改；想鎖首輸入可看下面備註）
  const fillText = (v: string) =>
    setAnswers((prev) => {
    // 想「第一次輸入後就鎖定不讓再改」→ 解除下一行註解
    // if (prev[idx] && String(prev[idx]).trim() !== "") return prev;

    const next = prev.slice();
    next[idx] = v;
    return next;
   });

  // 追蹤開始時間（用來算用時）
const startedAtRef = useRef<number>(Date.now());

// 寄出家長報告
async function sendReportEmail() {
  // 後端 base：優先用 .env 的 VITE_API_BASE，否則用 /api 反向代理
  const API_BASE = (import.meta as any).env?.VITE_API_BASE || "/api";
  const endpoint = `${API_BASE.replace(/\/$/, "")}/report/send?slug=${encodeURIComponent(slug)}`;

  // 假用戶（之後換成你登入系統的 userId）
  const userId = "user_002";

  // 準備 detail_rows
  const detail_rows = questions.map((q, i) => {
    const your = answers[i];
    const yourText = (() => {
      switch (q.type) {
        case "mcq":
          return your != null ? `${"ABCD"[your as number]}. ${stripBBCode(q.choices[your as number])}` : "";
        case "tf":
          return your == null ? "" : your ? "True" : "False";
        case "fill":
          return String(your ?? "");
        case "match": {
          const arr = your as Array<number | null>;
          const pairs = (q.left as string[]).map((L, li) => {
            const ri = arr?.[li];
            const R = ri != null ? q.right[ri] : "—";
            return `${stripBBCode(L)} → ${stripBBCode(R)}`;
          });
          return pairs.join(" | ");
        }
      }
    })();

    const correctText = (() => {
      switch (q.type) {
        case "mcq":
          if (q.answerLetter) {
            const idx = "ABCD".indexOf(q.answerLetter);
            return `${q.answerLetter}. ${stripBBCode(q.choices[idx])}`;
          }
          if (q.answerText) {
            const idx = q.choices.findIndex(c => normStr(c) === normStr(q.answerText!));
            const letter = idx >= 0 ? "ABCD"[idx] : "?";
            return `${letter}. ${stripBBCode(q.answerText)}`;
          }
          return "";
        case "tf":
          return q.answerBool ? "True" : "False";
        case "fill":
          return (q.acceptable || []).join(" | ");
        case "match": {
          const pairs = q.left.map((L, li) => {
            const ri = q.answerMap[li];
            const R = q.right[ri];
            return `${stripBBCode(L)} → ${stripBBCode(R)}`;
          });
          return pairs.join(" | ");
        }
      }
    })();

    return {
      q: stripBBCode(q.stem),
      yourAns: yourText,
      correct: correctText,
    };
  });

  const duration_min = Math.max(0, Math.round((Date.now() - startedAtRef.current) / 60000));

  const payload = {
    to_email: "parent@example.com",        // ← 這裡換成家長 email
    student_name: "學生姓名",               // ← 可帶入你的真實姓名
    grade: "",                             // 例如 "P1"（可留空）
    score,
    total,
    duration_min,
    summary: "",                           // 想加短評可寫在這
    detail_rows,
  };

  // 範例：送出家長報告的 handler 內
try {
  const res = await fetch("/api/report/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-User-Id": userId || "",   // 你現在已有
    },
    body: JSON.stringify(payload),
  });

  if (res.status === 402) {
    let msg = "此功能需購買方案";
    try {
      const json = await res.json();
      if (json?.detail) msg = json.detail;
    } catch {}
    alert(msg);
    // ✅ 付費導引入口 #2
    window.location.href = "/pricing";
    return;
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "發送失敗");
  }

  // 成功情況…
} catch (err) {
  alert((err as Error).message);
}

 
  const nextQ = () => (idx + 1 < questions.length ? setIdx(idx + 1) : setDone(true));
  const prevQ = () => idx > 0 && setIdx(idx - 1);
  const restart = () => {
    setAnswers(
      questions.map((q) => {
        if (q.type === "mcq") return null;
        if (q.type === "tf") return null;
        if (q.type === "fill") return "";
        if (q.type === "match") return Array((q as QMatch).left.length).fill(null);
        return null;
      })
    );
    setIdx(0);
    setDone(false);
  };

  if (loading) return <div className="p-6">Loading…</div>;

  if (!questions.length) {
    return (
      <div className="p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Quiz: {slug}</h1>
          <Link to="/packs" className="text-sm underline">← Back to Packs</Link>
        </div>
        <p>No questions.</p>
        {SHOW_DEBUG && (apiUrl || debug) && ( 
          <div className="text-xs text-gray-500 break-all">
            <span className="font-medium">source:</span> {apiUrl ?? "N/A"} 
            {debug ? <> · debug: {debug}</> : null}
          </div>
        )}
      </div>
    );
  }

  if (done) {
    const percent = total ? Math.round((score / total) * 100) : 0;
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-5">
        {/* 簡易彩紙（emoji） */}
        <div className="relative h-10">
          <AnimatePresence>
            {Array.from({ length: 12 }).map((_, i) => (
              <motion.div
                key={i}
                initial={{ y: 0, opacity: 0, rotate: 0 }}
                animate={{
                  y: [0, -30 - Math.random() * 40],
                  x: (Math.random() - 0.5) * 160,
                  opacity: [0, 1, 0],
                  rotate: (Math.random() - 0.5) * 120,
                }}
                transition={{ duration: 1.2 + Math.random() * 0.3, ease: "easeOut", delay: i * 0.03 }}
                className="absolute left-1/2 top-1/2"
              >
                <span className="text-lg select-none">🎉</span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Result</h1>
          <Link to="/packs" className="text-sm underline">← Back to Packs</Link>
        </div>

        {(apiUrl || debug) && (
          <div className="text-xs text-gray-500 break-all">
            source: {apiUrl ?? "N/A"}
            {debug ? <> · debug: {debug}</> : null}
          </div>
        )}

        <div className="text-lg">
          Score: <span className="font-semibold">{score}</span> / {total} ({percent}%)
        </div>

        {/* 詳解清單 */}
        <div className="space-y-3">
          {questions.map((q, i) => {
            const ok = isCorrect(q, answers[i]);
            return (
              <div
                key={q.id ?? i}
                className={`rounded border p-4 ${ok ? "border-emerald-400 bg-emerald-50" : "border-red-300 bg-red-50"}`}
              >
                <div className="mb-1 text-sm text-gray-500">Q{i + 1}</div>
                <div className="mb-2 font-medium">{renderContent(q.stem)}</div>

                <div className="text-sm">
                  你的答案：{" "}
                  {(() => {
                    const a = answers[i];
                    switch (q.type) {
                      case "mcq":
                        return a != null ? (
                          <>
                            {["A", "B", "C", "D"][a as number]}. {renderContent(q.choices[a as number])}
                          </>
                        ) : (<em>—</em>);
                      case "tf":
                        return a == null ? <em>—</em> : a ? "True" : "False";
                      case "fill":
                        return String(a ?? "").trim() ? renderContent(String(a)) : <em>—</em>;
                      case "match":
                        return (
                          <ul className="mt-1 list-disc pl-5">
                            {(q as QMatch).left.map((L, li) => {
                              const ri = (a as Array<number | null>)[li];
                              const R = ri != null ? (q as QMatch).right[ri] : "—";
                              return <li key={li}>{renderContent(L)} {" → "} {renderContent(R)}</li>;
                            })}
                          </ul>
                        );
                    }
                  })()}
                </div>

                {!ok && (
                  <div className="mt-2 text-sm">
                    正確答案：{" "}
                    {q.type === "mcq" &&
                      ((q as QMCQ).answerLetter
                        ? <>{(q as QMCQ).answerLetter}. {renderContent(q.choices["ABCD".indexOf((q as QMCQ).answerLetter!)])}</>
                        : renderContent(q.choices.find((c) => normStr(c) === normStr((q as any).answerText)) ?? "")
                      )}
                    {q.type === "tf" && ((q as QTF).answerBool ? "True" : "False")}
                    {q.type === "fill" && (q as QFill).acceptable.join(" | ")}
                    {q.type === "match" && (
                      <ul className="mt-1 list-disc pl-5">
                        {(q as QMatch).left.map((L, li) => {
                          const ri = (q as QMatch).answerMap[li];
                          const R = (q as QMatch).right[ri];
                          return <li key={li}>{renderContent(L)} {" → "} {renderContent(R)}</li>;
                        })}
                      </ul>
                    )}
                  </div>
                )}

                {q.explain ? (
                  <div className="mt-2 text-sm text-gray-600">解釋：{renderContent(q.explain)}</div>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="flex gap-2">
          <button onClick={restart} className="rounded bg-black px-3 py-2 text-white">Restart</button>
          <button onClick={sendReportEmail} className="rounded border px-3 py-2">
            寄送報告 ✉️
          </button> 
          <Link to="/packs" className="rounded border px-3 py-2">← Back to Packs</Link>
        </div>
      </div>
    );
  }

  // 題目畫面
  const q = questions[idx]!;
  const a = answers[idx];

   return (
     <div className="p-6 max-w-3xl mx-auto space-y-6">
       <div className="flex items-center justify-between">
         <div>
           <h1 className="text-2xl font-semibold">
             {packTitle ? `Quiz：${packTitle}` : `Quiz: ${slug}`}
           </h1>

           {/* 只在開發模式顯示 */}
           {SHOW_DEBUG && (apiUrl || debug) && (
             <div className="text-xs text-gray-500 break-all">
               <span className="font-medium">source:</span> {apiUrl ?? "N/A"}              
             </div>
           )}
         </div>
      
        <Link to="/packs" className="text-sm underline">← Back to Packs</Link>
      </div>

      {/* 進度條 + 分數徽章 */}
      <div className="flex items-center justify-between">
        {/* 進度條 */}
        <div className="flex-1 mr-3">
          <div className="h-2 w-full rounded-full bg-gray-200 overflow-hidden">
            <motion.div
              className="h-2 bg-black"
              initial={{ width: 0 }}
              animate={{ width: `${(idx / Math.max(questions.length - 1, 1)) * 100}%` }}
              transition={{ type: "spring", stiffness: 120, damping: 18 }}
            />
          </div>
          <div className="mt-1 text-xs text-gray-500">
            第 {idx + 1} / {questions.length} 題
          </div>
        </div>

        {/* 分數徽章 + +1 浮現 */}
        <motion.div
          key={score}
          initial={{ scale: 0.9, opacity: 0.6 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 12 }}
          className="relative select-none"
        >
          <div className="rounded-full px-3 py-1 text-sm font-semibold border bg-white shadow-sm">
            分數：{score} / {questions.length}
          </div>
          <AnimatePresence>
            {popPlusOne && (
              <motion.div
                initial={{ y: 8, opacity: 0, scale: 0.9 }}
                animate={{ y: -16, opacity: 1, scale: 1 }}
                exit={{ opacity: 0, y: -28 }}
                transition={{ duration: 0.6 }}
                className="absolute -right-3 -top-3 text-emerald-600 font-bold"
              >
                +1
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      <div className="rounded-lg border p-5">
        <div className="mb-3 font-medium">{renderContent(q.stem)}</div>
        {q.image ? <img src={q.image} alt="" className="mb-4 max-h-72 rounded" /> : null}

        {/* MCQ */}
        {q.type === "mcq" && (
          <div className="grid gap-2">
            {q.choices.map((text, i) => {
              const picked = a != null;         // 是否已選過本題
              const active = a === i;
              return (
                <motion.button
                  key={i}
                  onClick={() => pickMCQ(i)}
                  disabled={picked && !active}   // ✅ 已選後，其他選項禁用 
                  whileTap={{ scale: 0.98 }}
                  whileHover={{ scale: picked ? 1 : 1.01 }}
                  className={`flex items-start gap-2 rounded border p-3 text-left hover:bg-gray-50 ${
                    active ? "border-black ring-1 ring-black" : ""
                  } ${picked && !active ? "opacity-50 pointer-events-none" : ""}`}
                >
                  <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full border text-sm font-semibold">
                    {"ABCD"[i]}
                  </span>
                  <span className="flex-1 whitespace-normal break-words"> 
                  {renderContent(text)}
                  </span>   
                 </motion.button>
              );
            })}
          </div>
        )}

        {/* TF */}
        {q.type === "tf" && (
          <div className="flex gap-2">
            <motion.button
              whileTap={{ scale: 0.98 }}
              whileHover={{ scale: a === true ? 1 : 1.01 }} 
              onClick={() => pickTF(true)}
              disabled={a !== null && a !== undefined && a !== true}  // ✅ 已選另一邊就禁用 
              className={`rounded border px-3 py-2 ${
                a === true ? "border-black ring-1 ring-black" : "hover:bg-gray-50"
              } ${a !== null && a !== undefined && a !== true ? "opacity-50 pointer-events-none" : ""}`}
            >
              True
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.98 }}
              whileHover={{ scale: a === false ? 1 : 1.01 }} 
              onClick={() => pickTF(false)}
              disabled={a !== null && a !== undefined && a !== false} 
              className={`rounded border px-3 py-2 ${
                a === false ? "border-black ring-1 ring-black" : "hover:bg-gray-50"
              } ${a !== null && a !== undefined && a !== false ? "opacity-50 pointer-events-none" : ""}`}
            >
              False
            </motion.button>
          </div>
        )}

        {/* Fill */}
        {q.type === "fill" && (
          <div className="flex gap-2">
            <input
              value={typeof a === "string" ? a : ""} 
              onChange={(e) => fillText(e.target.value)}
              placeholder="你的答案…"
              className="w-full rounded border px-3 py-2"
            />
          </div>
        )}

        {/* Match */}
        {q.type === "match" && (q as QMatch).left.length > 0 && (
          <div className="grid gap-3">
            {(q as QMatch).left.map((L, li) => {
              const chosen = (a as Array<number | null>)[li];
              const used = new Set((a as Array<number | null>).filter((x, j) => j !== li && x != null) as number[]);
              return (
                <div key={li} className="flex items-center gap-3">
                  <div className="flex-1 rounded border p-2">{renderContent(L)}</div>
                  <span className="opacity-60">→</span>
                  <select
                    className="w-1/2 rounded border p-2"
                    value={chosen ?? ""}
                    onChange={(e) => pickMatch(li, e.target.value === "" ? null : Number(e.target.value))}
                  >
                    <option value="">請選擇</option>
                    {(q as QMatch).right.map((R, ri) => (
                      <option key={ri} value={ri} disabled={used.has(ri)}>
                        {stripBBCode(R)}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={prevQ}
          disabled={idx === 0}
          className="rounded border px-3 py-2 disabled:opacity-50"
        >
          ← Prev
        </button>

        <div className="text-sm text-gray-600">
          {q.type === "fill"
            ? String(a ?? "").trim()
              ? "已填寫"
              : "請填寫答案"
            : a == null || (Array.isArray(a) && a.some((x) => x == null))
            ? "請選擇答案"
            : "已選擇"}
        </div>

        <button
          onClick={nextQ}
          className="rounded bg-black px-3 py-2 text-white"
        >
          {idx < questions.length - 1 ? "Next →" : "Finish ✅"}
        </button>
      </div>
    </div>
  );
}
