// apps/frontend/src/pages/QuizPage.tsx (reviewed & fixed)
import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { renderContent, stripBBCode } from "../lib/bbcode";
import { fetchQuestions as _fetchQuestions } from "../lib/api";

/* =========================================================
   類型宣告（本地渲染模型）
========================================================= */
type QMCQ = {
  id?: string;
  type: "mcq";
  stem: string;
  choices: string[];
  answerLetter?: "A" | "B" | "C" | "D";
  answerText?: string;
  explain?: string;
  image?: string;
};

type QTF = {
  id?: string;
  type: "tf";
  stem: string;
  answerBool: boolean;
  explain?: string;
  image?: string;
};

type QFill = {
  id?: string;
  type: "fill";
  stem: string;
  acceptable: string[]; // 可接受答案（大小寫/空白正規化後比對）
  explain?: string;
  image?: string;
};

type QMatch = {
  id?: string;
  type: "match";
  stem: string;
  left: string[];
  right: string[];
  answerMap: number[]; // left[i] 對應 right[answerMap[i]]
  explain?: string;
  image?: string;
};

type Question = QMCQ | QTF | QFill | QMatch;

type ApiQuestionRow = {
  id?: string | number;
  type?: string; // "mcq" | "tf" | "fill" | "match"
  question?: string; // 或 stem
  explain?: string;
  image?: string;
  // MCQ
  choices?: string[];
  choiceA?: string;
  choiceB?: string;
  choiceC?: string;
  choiceD?: string;
  answer?: string; // MCQ: "A/B/C/D" 或文字；TF: true/false；Fill: 文字；Match: 可能是 JSON
  // Fill
  answers?: string | string[]; // 多答案以 | 分隔；或 JSON 陣列
  // Match
  pairs?: unknown; // string | Array<{left:string; right:string}> | object
  left?: string | string[];
  right?: string | string[];
  answerMap?: string | number[]; // "0,2,1" / [0,2,1]
  [k: string]: any;
};

/* =========================================================
   常數與工具
========================================================= */
const SHOW_DEBUG = !!import.meta.env.DEV;

function normStr(x: string): string {
  return String(x ?? "").trim().toLowerCase().replace(/\s+/g, "");
}

function parseList(x?: unknown): string[] {
  if (Array.isArray(x)) return x.map((v) => String(v));
  if (typeof x !== "string") return [];
  const s = x.trim();
  if (!s) return [];
  if (s.startsWith("[")) {
    try {
      const arr = JSON.parse(s);
      return Array.isArray(arr) ? arr.map((v) => String(v)) : [];
    } catch {
      return [];
    }
  }
  return s.split("|").map((v) => v.trim());
}

function toLocalQuestion(r: ApiQuestionRow, idx: number): Question | null {
  const t = (r.type || "").toLowerCase();
  const stem = (r.question ?? r.stem ?? "").toString();

  if (t === "mcq") {
    const choices = r.choices && Array.isArray(r.choices)
      ? (r.choices as string[])
      : [r.choiceA ?? "", r.choiceB ?? "", r.choiceC ?? "", r.choiceD ?? ""]; 
    let answerLetter: QMCQ["answerLetter"] | undefined;
    let answerText: string | undefined;
    if (typeof r.answer === "string" && /^[ABCD]$/i.test(r.answer)) {
      answerLetter = r.answer.toUpperCase() as any;
    } else if (r.answer) {
      answerText = String(r.answer);
    }
    return {
      id: String(r.id ?? idx + 1),
      type: "mcq",
      stem,
      choices,
      answerLetter,
      answerText,
      explain: r.explain as string | undefined,
      image: r.image as string | undefined,
    };
  }

  if (t === "tf") {
    const truthy = ["true", "t", "1", "yes", "y"];
    const bool = typeof r.answer === "string" ? truthy.includes(r.answer.toLowerCase()) : Boolean(r.answer);
    return {
      id: String(r.id ?? idx + 1),
      type: "tf",
      stem,
      answerBool: bool,
      explain: r.explain as string | undefined,
      image: r.image as string | undefined,
    };
  }

  if (t === "fill") {
    let acceptable: string[] = [];
    const ans = r.answers as any;
    if (Array.isArray(ans)) acceptable = ans.map((x) => String(x));
    else if (typeof ans === "string" && ans.trim()) {
      if (ans.trim().startsWith("[")) {
        try { acceptable = JSON.parse(ans); } catch { acceptable = []; }
      } else {
        acceptable = ans.split("|").map((x) => x.trim()).filter(Boolean);
      }
    } else if (r.answer) {
      acceptable = [String(r.answer)];
    }
    return {
      id: String(r.id ?? idx + 1),
      type: "fill",
      stem,
      acceptable: acceptable.length ? acceptable : [String(r.answer ?? "")].filter(Boolean),
      explain: r.explain as string | undefined,
      image: r.image as string | undefined,
    };
  }

  if (t === "match") {
    let left = parseList(r.left);
    let right = parseList(r.right);

    if ((!left.length || !right.length) && r.pairs) {
      try {
        const arr = typeof r.pairs === "string" ? JSON.parse(r.pairs) : r.pairs;
        if (Array.isArray(arr)) {
          left = arr.map((x: any) => String(x?.left ?? "")).filter(Boolean);
          right = arr.map((x: any) => String(x?.right ?? "")).filter(Boolean);
        }
      } catch {}
    }

    let answerMap: number[] = [];
    const amap = r.answerMap as any;
    if (Array.isArray(amap)) {
      answerMap = amap.map((n) => Number(n)).filter((n) => Number.isFinite(n));
    } else if (typeof amap === "string" && amap.trim()) {
      const s = amap.trim();
      if (s.startsWith("[")) {
        try { answerMap = JSON.parse(s); } catch { answerMap = []; }
      } else {
        answerMap = s.split(",").map((x) => Number(x.trim())).filter((n) => Number.isFinite(n));
      }
    }

    const n = Math.min(left.length, right.length);
    const L = left.slice(0, n);
    const R = right.slice(0, n);
    const A = answerMap.length === n ? answerMap.slice(0, n) : Array.from({ length: n }, (_, i) => i);

    return {
      id: String(r.id ?? idx + 1),
      type: "match",
      stem,
      left: L,
      right: R,
      answerMap: A,
      explain: r.explain as string | undefined,
      image: r.image as string | undefined,
    };
  }

  return null; // 未知題型
}

/* =========================================================
   元件
========================================================= */
export default function QuizPage() {
  const [sp] = useSearchParams();
  const slug = sp.get("slug") || "";

  const [loading, setLoading] = useState(true);
  const [apiUrl, setApiUrl] = useState<string | null>(null);
  const [debug, setDebug] = useState<string | null>(null);
  const [packTitle, setPackTitle] = useState("");

  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<any[]>([]);
  const [idx, setIdx] = useState(0);
  const [done, setDone] = useState(false);
  const [popPlusOne, setPopPlusOne] = useState(false);

  const userId = useMemo(() => localStorage.getItem("uid") || "", []);

  // 規整 API Base 候選（for POST 報告）
  function normBase(s?: string) {
    let b = (s ?? "").trim();
    b = b.replace(/^['"]|['"]$/g, "");
    b = b.replace(/\/+$/, "");
    const m = b.match(/^(https?:\/\/[^/]+)(?:\/https?:\/\/[^/]+)?$/);
    return m ? m[1] : b;
  }
  const dedupe = (arr: string[]) => Array.from(new Set(arr.filter(Boolean)));

  /* -----------------------------
     載入題目（使用 lib/api 的容錯 fetch）
  ----------------------------- */
  useEffect(() => {
    let alive = true;
    async function run() {
      setLoading(true);
      try {
        const ret = await _fetchQuestions(slug); // { list, usedUrl, debug }
        if (!alive) return;
        setApiUrl(ret.usedUrl || null);
        setDebug(ret.debug || null);
        setPackTitle(""); // 若後端之後提供，可在此設

        const list = (ret.list || [])
          .map((row: any, i: number) => toLocalQuestion(row as ApiQuestionRow, i))
          .filter(Boolean) as Question[];
        setQuestions(list);
        setAnswers(list.map((q) => (q.type === "fill" ? "" : q.type === "match" ? Array((q as QMatch).left.length).fill(null) : null)));
        setIdx(0);
        setDone(false);
      } catch (e) {
        console.error(e);
        if (!alive) return;
        setQuestions([]);
        setAnswers([]);
      } finally {
        if (alive) setLoading(false);
      }
    }
    if (slug) run();
    return () => { alive = false; };
  }, [slug]);

  /* -----------------------------
     衍生：當前分數
  ----------------------------- */
  const score = useMemo(() => {
    let s = 0;
    questions.forEach((q, i) => { if (isCorrect(q, answers[i])) s += 1; });
    return s;
  }, [questions, answers]);
  const total = questions.length;

  /* -----------------------------
     互動：作答
  ----------------------------- */
  function pickMCQ(i: number) {
    setAnswers((prev) => {
      const cur = prev[idx];
      if (cur != null && cur !== i) return prev; // 已選其他 → 不變
      const copy = prev.slice();
      copy[idx] = i;
      if (isCorrect(questions[idx], i)) {
        setPopPlusOne(true);
        setTimeout(() => setPopPlusOne(false), 650);
      }
      return copy;
    });
  }

  function pickTF(val: boolean) {
    setAnswers((prev) => {
      const cur = prev[idx];
      if (cur != null && cur !== val) return prev;
      const copy = prev.slice();
      copy[idx] = val;
      if (isCorrect(questions[idx], val)) {
        setPopPlusOne(true);
        setTimeout(() => setPopPlusOne(false), 650);
      }
      return copy;
    });
  }

  function fillText(v: string) {
    setAnswers((prev) => { const copy = prev.slice(); copy[idx] = v; return copy; });
  }

  function pickMatch(li: number, ri: number | null) {
    setAnswers((prev) => {
      const cur = (prev[idx] ?? []) as Array<number | null>;
      const arr = Array.isArray(cur) ? cur.slice() : [];
      arr[li] = ri;
      const copy = prev.slice();
      copy[idx] = arr;
      return copy;
    });
  }

  const nextQ = () => (idx + 1 < questions.length ? setIdx(idx + 1) : setDone(true));
  const prevQ = () => idx > 0 && setIdx(idx - 1);
  const restart = () => {
    setAnswers(questions.map((q) => (q.type === "fill" ? "" : q.type === "match" ? Array((q as QMatch).left.length).fill(null) : null)));
    setIdx(0);
    setDone(false);
  };

  /* -----------------------------
     郵件報告（多候選 URL，自動容錯）
  ----------------------------- */
  async function sendReportEmail() {
    try {
      const detail_rows = questions.map((q, i) => {
        const ok = isCorrect(q, answers[i]);
        return { q: stripBBCode(q.stem), yourAns: formatYourAnswer(q, answers[i]), correct: formatCorrectAnswer(q), ok };
      });

      const payload = {
        to_email: "", // 若後端會從 profile 取，這裡可留空
        student_name: "",
        grade: "",
        score,
        total,
        duration_min: undefined,
        summary: "",
        detail_rows,
      };

      const base = normBase(import.meta.env.VITE_API_BASE as string | undefined);
      const direct = "https://study-game-back.onrender.com";
      const qs = `slug=${encodeURIComponent(slug)}`;
      const candidates = dedupe([
        base && `${base}/report/send?${qs}`,
        base && `${base}/api/report/send?${qs}`,
        `${direct}/report/send?${qs}`,
        `${direct}/api/report/send?${qs}`,
        `/api/report/send?${qs}`, // 同源反向代理
        `/report/send?${qs}`,
      ]);

      let lastErr: any = null;
      for (const url of candidates) {
        try {
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-User-Id": userId || "" },
            body: JSON.stringify(payload),
          });

          if (res.status === 402) {
            let msg = "此功能需購買方案";
            try { const j = await res.json(); if (j?.detail) msg = j.detail; } catch {}
            alert(msg);
            window.location.href = "/pricing";
            return;
          }

          if (!res.ok) { lastErr = new Error(`HTTP ${res.status} @ ${url}`); continue; }
          alert("已寄出學習報告！");
          return;
        } catch (e) { lastErr = e; continue; }
      }
      throw lastErr ?? new Error("發送失敗");
    } catch (err: any) {
      alert(err?.message || String(err));
    }
  }

  /* -----------------------------
     判分與格式化
  ----------------------------- */
  function isCorrect(q: Question, a: any): boolean {
    if (q.type === "mcq") {
      if (a == null) return false;
      if (q.answerLetter) {
        const i = "ABCD".indexOf(q.answerLetter); return i === a;
      }
      if (q.answerText) {
        const picked = (q as QMCQ).choices[a] ?? ""; return normStr(picked) === normStr(q.answerText);
      }
      return false;
    }
    if (q.type === "tf") return a != null && Boolean(a) === q.answerBool;
    if (q.type === "fill") {
      const t = normStr(String(a ?? "")); if (!t) return false; return q.acceptable.some((acc) => normStr(acc) === t);
    }
    // match
    const arr = Array.isArray(a) ? a : [];
    if (arr.length !== (q as QMatch).left.length) return false;
    for (let i = 0; i < (q as QMatch).left.length; i++) { const ri = arr[i]; if (ri == null) return false; if (ri !== (q as QMatch).answerMap[i]) return false; }
    return true;
  }

  function formatYourAnswer(q: Question, a: any): string {
    if (q.type === "mcq") { if (a == null) return "—"; const letter = "ABCD"[a] ?? "?"; const text = (q.choices[a] ?? "").toString(); return `${letter}. ${stripBBCode(text)}`; }
    if (q.type === "tf") return a == null ? "—" : a ? "True" : "False";
    if (q.type === "fill") { const t = String(a ?? "").trim(); return t || "—"; }
    const arr = Array.isArray(a) ? a : [];
    return (q as QMatch).left.map((L, li) => { const ri = arr[li]; const R = ri != null ? (q as QMatch).right[ri] : "—"; return `${stripBBCode(L)} → ${stripBBCode(R)}`; }).join(" | ");
  }

  function formatCorrectAnswer(q: Question): string {
    if (q.type === "mcq") {
      if (q.answerLetter) { const i = "ABCD".indexOf(q.answerLetter); const text = q.choices[i] ?? ""; return `${q.answerLetter}. ${stripBBCode(text)}`; }
      if (q.answerText) return stripBBCode(q.answerText);
      return "";
    }
    if (q.type === "tf") return q.answerBool ? "True" : "False";
    if (q.type === "fill") return q.acceptable.join(" | ");
    return (q as QMatch).left.map((L, li) => `${stripBBCode(L)} → ${stripBBCode((q as QMatch).right[(q as QMatch).answerMap[li]])}`).join(" | ");
  }

  /* =========================================================
     Render
  ========================================================= */
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
          <div className="text-xs text-gray-500 break-all">source: {apiUrl ?? "N/A"}{debug ? <> · debug: {debug}</> : null}</div>
        )}
      </div>
    );
  }

  if (done) {
    const percent = total ? Math.round((score / total) * 100) : 0;
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-5">
        {/* 彩紙 */}
        <div className="relative h-10">
          <AnimatePresence>
            {Array.from({ length: 12 }).map((_, i) => (
              <motion.div key={i} initial={{ y: 0, opacity: 0, rotate: 0 }} animate={{ y: [0, -30 - Math.random() * 40], x: (Math.random() - 0.5) * 160, opacity: [0, 1, 0], rotate: (Math.random() - 0.5) * 120, }} transition={{ duration: 1.2 + Math.random() * 0.3, ease: "easeOut", delay: i * 0.03 }} className="absolute left-1/2 top-1/2">
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
          <div className="text-xs text-gray-500 break-all">source: {apiUrl ?? "N/A"}{debug ? <> · debug: {debug}</> : null}</div>
        )}

        <div className="text-lg">Score: <span className="font-semibold">{score}</span> / {total} ({percent}%)</div>

        {/* 詳解清單 */}
        <div className="space-y-3">
          {questions.map((q, i) => {
            const ok = isCorrect(q, answers[i]);
            return (
              <div key={q.id ?? i} className={`rounded border p-4 ${ok ? "border-emerald-400 bg-emerald-50" : "border-red-300 bg-red-50"}`}>
                <div className="mb-1 text-sm text-gray-500">Q{i + 1}</div>
                <div className="mb-2 font-medium">{renderContent(q.stem)}</div>
                <div className="text-sm">你的答案： {formatYourAnswer(q, answers[i]) || <em>—</em>}</div>
                {!ok && <div className="mt-2 text-sm">正確答案： {formatCorrectAnswer(q)}</div>}
                {"explain" in q && q.explain ? (<div className="mt-2 text-sm text-gray-600">解釋：{renderContent(q.explain)}</div>) : null}
              </div>
            );
          })}
        </div>

        <div className="flex gap-2">
          <button onClick={restart} className="rounded bg-black px-3 py-2 text-white">Restart</button>
          <button onClick={sendReportEmail} className="rounded border px-3 py-2">寄送報告 ✉️</button>
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
          <h1 className="text-2xl font-semibold">{packTitle ? `Quiz：${packTitle}` : `Quiz: ${slug}`}</h1>
          {SHOW_DEBUG && (apiUrl || debug) && (
            <div className="text-xs text-gray-500 break-all"><span className="font-medium">source:</span> {apiUrl ?? "N/A"}{debug ? <> · debug: {debug}</> : null}</div>
          )}
        </div>
        <Link to="/packs" className="text-sm underline">← Back to Packs</Link>
      </div>

      {/* 進度條 + 分數徽章 */}
      <div className="flex items-center justify-between">
        {/* 進度條 */}
        <div className="mr-3 flex-1">
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
            <motion.div className="h-2 bg-black" initial={{ width: 0 }} animate={{ width: `${(idx / Math.max(questions.length - 1, 1)) * 100}%` }} transition={{ type: "spring", stiffness: 120, damping: 18 }} />
          </div>
          <div className="mt-1 text-xs text-gray-500">第 {idx + 1} / {questions.length} 題</div>
        </div>

        {/* 分數徽章 + +1 浮現 */}
        <motion.div key={score} initial={{ scale: 0.9, opacity: 0.6 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 200, damping: 12 }} className="relative select-none">
          <div className="rounded-full border bg-white px-3 py-1 text-sm font-semibold shadow-sm">分數：{score} / {questions.length}</div>
          <AnimatePresence>
            {popPlusOne && (
              <motion.div initial={{ y: 8, opacity: 0, scale: 0.9 }} animate={{ y: -16, opacity: 1, scale: 1 }} exit={{ opacity: 0, y: -28 }} transition={{ duration: 0.6 }} className="absolute -right-3 -top-3 font-bold text-emerald-600">+1</motion.div>
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
              const picked = a != null; // 是否已選過本題
              const active = a === i;
              return (
                <motion.button key={i} onClick={() => pickMCQ(i)} disabled={picked && !active} whileTap={{ scale: 0.98 }} whileHover={{ scale: picked ? 1 : 1.01 }} className={`flex items-start gap-2 rounded border p-3 text-left hover:bg-gray-50 ${active ? "border-black ring-1 ring-black" : ""} ${picked && !active ? "pointer-events-none opacity-50" : ""}`}>
                  <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full border text-sm font-semibold">{"ABCD"[i]}</span>
                  <span className="flex-1 break-words whitespace-normal">{renderContent(text)}</span>
                </motion.button>
              );
            })}
          </div>
        )}

        {/* TF */}
        {q.type === "tf" && (
          <div className="flex gap-2">
            <motion.button whileTap={{ scale: 0.98 }} whileHover={{ scale: a === true ? 1 : 1.01 }} onClick={() => pickTF(true)} disabled={a !== null && a !== undefined && a !== true} className={`rounded border px-3 py-2 ${a === true ? "border-black ring-1 ring-black" : "hover:bg-gray-50"} ${a !== null && a !== undefined && a !== true ? "pointer-events-none opacity-50" : ""}`}>True</motion.button>
            <motion.button whileTap={{ scale: 0.98 }} whileHover={{ scale: a === false ? 1 : 1.01 }} onClick={() => pickTF(false)} disabled={a !== null && a !== undefined && a !== false} className={`rounded border px-3 py-2 ${a === false ? "border-black ring-1 ring-black" : "hover:bg-gray-50"} ${a !== null && a !== undefined && a !== false ? "pointer-events-none opacity-50" : ""}`}>False</motion.button>
          </div>
        )}

        {/* Fill */}
        {q.type === "fill" && (
          <div className="flex gap-2">
            <input value={typeof a === "string" ? a : ""} onChange={(e) => fillText(e.target.value)} placeholder="你的答案…" className="w-full rounded border px-3 py-2" />
          </div>
        )}

        {/* Match */}
        {q.type === "match" && (q as QMatch).left.length > 0 && (
          <div className="grid gap-3">
            {(q as QMatch).left.map((L, li) => {
              const arr = Array.isArray(a) ? (a as Array<number | null>) : [];
              const chosen = arr[li];
              const used = new Set(arr.filter((x, j) => j !== li && x != null) as number[]);
              return (
                <div key={li} className="flex items-center gap-3">
                  <div className="flex-1 rounded border p-2">{renderContent(L)}</div>
                  <span className="opacity-60">→</span>
                  <select className="w-1/2 rounded border p-2" value={chosen ?? ""} onChange={(e) => pickMatch(li, e.target.value === "" ? null : Number(e.target.value))}>
                    <option value="">請選擇</option>
                    {(q as QMatch).right.map((R, ri) => (
                      <option key={ri} value={ri} disabled={used.has(ri)}>{stripBBCode(R)}</option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <button onClick={prevQ} disabled={idx === 0} className="rounded border px-3 py-2 disabled:opacity-50">← Prev</button>
        <div className="text-sm text-gray-600">
          {q.type === "fill"
            ? String(a ?? "").trim() ? "已填寫" : "請填寫答案"
            : a == null || (Array.isArray(a) && a.some((x) => x == null)) ? "請選擇答案" : "已選擇"}
        </div>
        <div className="flex gap-2">
          <button onClick={nextQ} className="rounded bg-black px-3 py-2 text-white">{idx < questions.length - 1 ? "Next →" : "Finish ✅"}</button>
          <button onClick={sendReportEmail} className="rounded border px-3 py-2">寄送報告 ✉️</button>
        </div>
      </div>
    </div>
  );
}
