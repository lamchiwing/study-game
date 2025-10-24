// apps/frontend/src/pages/QuizPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { renderContent, stripBBCode } from "../lib/bbcode";

const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/+$/, "") ||
  "https://study-game-back.onrender.com";

// 想完全隱藏 source/debug 就設 false
const SHOW_DEBUG = false;

/* =========================================================
   類型宣告
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
  acceptable: string[];
  explain?: string;
  image?: string;
};

type QMatch = {
  id?: string;
  type: "match";
  stem: string;
  left: string[];
  right: string[];
  answerMap: number[];
  explain?: string;
  image?: string;
};

type Question = QMCQ | QTF | QFill | QMatch;

type ApiQuestionRow = {
  id?: string;
  type?: string;
  question?: string;
  choiceA?: string;
  choiceB?: string;
  choiceC?: string;
  choiceD?: string;
  answer?: string;
  answers?: string;
  explain?: string;
  image?: string;
  pairs?: string;
  left?: string;
  right?: string;
  answerMap?: string;
};

type ApiQuizResponse = {
  title?: string;
  list?: ApiQuestionRow[];
  usedUrl?: string;
  debug?: string;
};

/* =========================================================
   工具
========================================================= */
function normStr(x: string): string {
  return String(x ?? "").trim().toLowerCase().replace(/\s+/g, "");
}

function mapRowToQuestion(r: ApiQuestionRow, idx: number): Question {
  const t = (r.type || "").toLowerCase();
  const stem = r.question || "";

  // MCQ
  if (t === "mcq") {
    const choices = [r.choiceA ?? "", r.choiceB ?? "", r.choiceC ?? "", r.choiceD ?? ""];
    let answerLetter: "A" | "B" | "C" | "D" | undefined;
    let answerText: string | undefined;

    if (r.answer && /^[ABCD]$/i.test(r.answer)) {
      answerLetter = r.answer.toUpperCase() as any;
    } else if (r.answer) {
      answerText = r.answer;
    }

    return {
      id: r.id || String(idx + 1),
      type: "mcq",
      stem,
      choices,
      answerLetter,
      answerText,
      explain: r.explain,
      image: r.image,
    };
  }

  // TF
  if (t === "tf") {
    const bool =
      typeof r.answer === "string"
        ? ["true", "t", "1", "yes", "y"].includes(r.answer.toLowerCase())
        : false;

    return {
      id: r.id || String(idx + 1),
      type: "tf",
      stem,
      answerBool: bool,
      explain: r.explain,
      image: r.image,
    };
  }

  // Fill
  if (t === "fill") {
    let acc: string[] = [];
    if (r.answers && r.answers.trim().startsWith("[")) {
      try {
        acc = JSON.parse(r.answers);
      } catch {
        acc = [];
      }
    } else if (r.answers) {
      acc = r.answers.split("|").map((x) => x.trim()).filter(Boolean);
    } else if (r.answer) {
      acc = [r.answer];
    }

    return {
      id: r.id || String(idx + 1),
      type: "fill",
      stem,
      acceptable: acc.length ? acc : [r.answer ?? ""].filter(Boolean),
      explain: r.explain,
      image: r.image,
    };
  }

  // Match（支援 pairs 或 left/right）
  let left = parseList(r.left);
  let right = parseList(r.right);

  if ((!left.length || !right.length) && r.pairs) {
    try {
      const arr = JSON.parse(r.pairs); // 期待 [{left:"..", right:".."}, ...]
      if (Array.isArray(arr)) {
        left = arr.map((x: any) => String(x?.left ?? "")).filter(Boolean);
        right = arr.map((x: any) => String(x?.right ?? "")).filter(Boolean);
      }
    } catch {
      // ignore
    }
  }

  let answerMap: number[] = [];
  if (r.answerMap) {
    const s = r.answerMap.trim();
    if (s.startsWith("[")) {
      try {
        answerMap = JSON.parse(s);
      } catch {
        answerMap = [];
      }
    } else {
      answerMap = s
        .split(",")
        .map((x) => x.trim())
        .filter((x) => x !== "")
        .map((x) => Number(x))
        .filter((n) => Number.isFinite(n));
    }
  }

  const n = Math.min(left.length, right.length);
  const L = left.slice(0, n);
  const R = right.slice(0, n);
  const A = answerMap.length === n ? answerMap.slice(0, n) : Array.from({ length: n }, (_, i) => i);

  return {
    id: r.id || String(idx + 1),
    type: "match",
    stem,
    left: L,
    right: R,
    answerMap: A,
    explain: r.explain,
    image: r.image,
  };
}

function parseList(x?: string): string[] {
  if (!x) return [];
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

/* =========================================================
   組件
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

  // 取得 UserId（示例：從 localStorage）
  const userId = useMemo(() => localStorage.getItem("uid") || "", []);

  // 載入題目
  useEffect(() => {
    let alive = true;
    async function run() {
      setLoading(true);
      try {
        const url = `${API_BASE}/api/quiz?slug=${encodeURIComponent(slug)}`;
        const r = await fetch(url, { credentials: "omit" });
        const ret = (await r.json()) as ApiQuizResponse;

        setApiUrl(ret?.usedUrl || null);
        setDebug(ret?.debug || null);
        setPackTitle(ret?.title || "");

        const list = (ret?.list ?? []).map(mapRowToQuestion);
        setQuestions(list);

        // 初始化答案陣列
        setAnswers(
          list.map((q) => {
            if (q.type === "mcq") return null;
            if (q.type === "tf") return null;
            if (q.type === "fill") return "";
            if (q.type === "match") return Array((q as QMatch).left.length).fill(null);
            return null;
          })
        );
        setIdx(0);
        setDone(false);
      } catch (e) {
        console.error(e);
        setQuestions([]);
        setAnswers([]);
      } finally {
        if (alive) setLoading(false);
      }
    }
    if (slug) run();
    return () => {
      alive = false;
    };
  }, [slug]);

  // 分數
  const score = useMemo(() => {
    let s = 0;
    questions.forEach((q, i) => {
      if (isCorrect(q, answers[i])) s += 1;
    });
    return s;
  }, [questions, answers]);

  const total = questions.length;

  // 互動：作答
  function pickMCQ(i: number) {
    setAnswers((prev) => {
      const cur = prev[idx];
      if (cur != null && cur !== i) return prev;
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
    setAnswers((prev) => {
      const copy = prev.slice();
      copy[idx] = v;
      return copy;
    });
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

  // 郵件報告
  async function sendReportEmail() {
    try {
      const detail_rows = questions.map((q, i) => {
        const ok = isCorrect(q, answers[i]);
        return {
          q: stripBBCode(q.stem),
          yourAns: formatYourAnswer(q, answers[i]),
          correct: formatCorrectAnswer(q),
          ok,
        };
      });

      const payload = {
        to_email: "",
        student_name: "",
        grade: "",
        score,
        total,
        duration_min: undefined,
        summary: "",
        detail_rows,
      };

      const res = await fetch(
        `${API_BASE}/api/report/send?slug=${encodeURIComponent(slug)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-User-Id": userId || "",
          },
          body: JSON.stringify(payload),
        }
      );

      if (res.status === 402) {
        let msg = "此功能需購買方案";
        try {
          const j = await res.json();
          if (j?.detail) msg = j.detail;
        } catch {}
        alert(msg);
        window.location.href = "/pricing";
        return;
      }

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "發送失敗");
      }

      alert("已寄出學習報告！");
    } catch (err: any) {
      alert(err?.message || String(err));
    }
  }

  // 判分 & 顯示文字
  function isCorrect(q: Question, a: any): boolean {
    if (q.type === "mcq") {
      if (a == null) return false;
      if (q.answerLetter) {
        const i = "ABCD".indexOf(q.answerLetter);
        return i === a;
      }
      if (q.answerText) {
        const picked = (q as QMCQ).choices[a] ?? "";
        return normStr(picked) === normStr(q.answerText);
      }
      return false;
    }

    if (q.type === "tf") {
      if (a == null) return false;
      return Boolean(a) === q.answerBool;
    }

    if (q.type === "fill") {
      const t = normStr(String(a ?? ""));
      if (!t) return false;
      return q.acceptable.some((acc) => normStr(acc) === t);
    }

    // match
    const arr = Array.isArray(a) ? a : [];
    if (arr.length !== q.left.length) return false;
    for (let i = 0; i < q.left.length; i++) {
      const ri = arr[i];
      if (ri == null) return false;
      if (ri !== q.answerMap[i]) return false;
    }
    return true;
  }

  function formatYourAnswer(q: Question, a: any): string {
    if (q.type === "mcq") {
      if (a == null) return "—";
      const letter = "ABCD"[a] ?? "?";
      const text = (q.choices[a] ?? "").toString();
      return `${letter}. ${stripBBCode(text)}`;
    }
    if (q.type === "tf") {
      return a == null ? "—" : a ? "True" : "False";
    }
    if (q.type === "fill") {
      const t = String(a ?? "").trim();
      return t || "—";
    }
    // match
    const arr = Array.isArray(a) ? a : [];
    return q.left
      .map((L, li) => {
        const ri = arr[li];
        const R = ri != null ? q.right[ri] : "—";
        return `${stripBBCode(L)} → ${stripBBCode(R)}`;
      })
      .join(" | ");
  }

  function formatCorrectAnswer(q: Question): string {
    if (q.type === "mcq") {
      if (q.answerLetter) {
        const i = "ABCD".indexOf(q.answerLetter);
        const text = q.choices[i] ?? "";
        return `${q.answerLetter}. ${stripBBCode(text)}`;
      }
      if (q.answerText) return stripBBCode(q.answerText);
      return "";
    }
    if (q.type === "tf") {
      return q.answerBool ? "True" : "False";
    }
    if (q.type === "fill") {
      return q.acceptable.join(" | ");
    }
    // match
    return q.left
      .map((L, li) => `${stripBBCode(L)} → ${stripBBCode(q.right[q.answerMap[li]])}`)
      .join(" | ");
  }

// 與你後端一致的 API_BASE
function normBase(s?: string) {
  let b = (s ?? "").trim().replace(/^['"]|['"]$/g, "").replace(/\/+$/, "");
  return b || "https://study-game-back.onrender.com";
}
const API_BASE = normBase(import.meta.env.VITE_API_BASE as string | undefined);

// 解析 slug → (subject, grade)；和後端邏輯一致
function parseSubjectGrade(slug?: string) {
  const s = (slug || "").toLowerCase();
  const parts = s.split(/[^a-z0-9]+/).filter(Boolean);
  let subject = ""; let grade = "";
  const map: Record<string, string> = {
    cn: "chinese", chi: "chinese", zh: "chinese",
    maths: "math", mathematics: "math",
    gen: "general", gs: "general",
  };
  const valid = new Set(["chinese", "math", "general"]);

  function normSub(x: string) {
    const k = x.trim().toLowerCase();
    return map[k] || k;
  }
  function toGradeToken(x: string) {
    let t = x.trim().toLowerCase();
    for (const pre of ["grade", "g", "p", "primary", "yr", "year"]) {
      if (t.startsWith(pre)) { t = t.slice(pre.length); break; }
    }
    const digits = t.replace(/[^0-9]/g, "");
    const n = digits ? parseInt(digits, 10) : 0;
    return (n >= 1 && n <= 6) ? `grade${n}` : "";
  }

  for (const tok of parts) {
    const gg = toGradeToken(tok);
    if (gg) { grade = gg; continue; }
    const ns = normSub(tok);
    if (valid.has(ns)) { subject = ns; }
  }
  return { subject, grade };
}

// —— 這個函式你可以在「寄報告」按鈕用到 —— //
export async function sendReportEmail({
  slug,                      // 例如 "chinese-p1"
  toEmail,
  studentName,
  score,
  total,
  onInfo,                    // (msg:string) => void  顯示訊息（可對接 toast）
  onError,                   // (msg:string) => void  顯示錯誤
}: {
  slug: string;
  toEmail: string;
  studentName: string;
  score: number;
  total: number;
  onInfo?: (m: string) => void;
  onError?: (m: string) => void;
}) {
  const { subject, grade } = parseSubjectGrade(slug);
  const uid = localStorage.getItem("uid") || "";

  try {
    const res = await fetch(`${API_BASE}/report/send?slug=${encodeURIComponent(slug)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User-Id": uid, // 後端需要
      },
      body: JSON.stringify({
        to_email: toEmail,
        student_name: studentName,
        score,
        total,
      }),
    });

    if (res.ok) {
      onInfo?.("報告已寄出 ✅");
      return true;
    }

    // 讀字串以便提示
    const text = await res.text();

    if (res.status === 402) {
      // 未購買 → 帶上科目與年級去結帳（Starter）
      onInfo?.("此功能需購買方案，正前往結帳頁…");
      const q = new URLSearchParams({
        plan: "starter",
        subject,
        grade,
      });
      window.location.assign(`/checkout?${q.toString()}`);
      return false;
    }

    if (res.status === 429) {
      // 超額 / 冷卻
      onError?.("寄送過於頻密或已達今日上限，請稍後再試。");
      return false;
    }

    if (res.status === 400) {
      onError?.("資料不完整或格式有誤（請檢查電郵、科目與年級）。");
      return false;
    }

    if (res.status === 401) {
      onError?.("缺少用戶識別（X-User-Id）。請重新整理再試。");
      return false;
    }

    // 其他狀況（500 等）
    onError?.(`寄送失敗：${text || `HTTP ${res.status}`}`);
    return false;

  } catch (err: any) {
    onError?.(`連線失敗：${err?.message || err}`);
    return false;
  }
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
          <Link to="/packs" className="text-sm underline">
            ← Back to Packs
          </Link>
        </div>
        <p>No questions.</p>
        {SHOW_DEBUG && (apiUrl || debug) && (
          <div className="break-all text-xs text-gray-500">
            source: {apiUrl ?? "N/A"}
            {debug ? <> · debug: {debug}</> : null}
          </div>
        )}
      </div>
    );
  }

  if (done) {
    const percent = total ? Math.round((score / total) * 100) : 0;
    return (
      <div className="mx-auto max-w-3xl space-y-5 p-6">
        {/* 彩紙 */}
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
                transition={{
                  duration: 1.2 + Math.random() * 0.3,
                  ease: "easeOut",
                  delay: i * 0.03,
                }}
                className="absolute left-1/2 top-1/2"
              >
                <span className="select-none text-lg">🎉</span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Result</h1>
          <Link to="/packs" className="text-sm underline">
            ← Back to Packs
          </Link>
        </div>

        {SHOW_DEBUG && (apiUrl || debug) && (
          <div className="break-all text-xs text-gray-500">
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
                className={`rounded border p-4 ${
                  ok ? "border-emerald-400 bg-emerald-50" : "border-red-300 bg-red-50"
                }`}
              >
                <div className="mb-1 text-sm text-gray-500">Q{i + 1}</div>
                <div className="mb-2 font-medium">{renderContent(q.stem)}</div>

                <div className="text-sm">你的答案： {formatYourAnswer(q, answers[i]) || <em>—</em>}</div>

                {!ok && <div className="mt-2 text-sm">正確答案： {formatCorrectAnswer(q)}</div>}

                {"explain" in q && q.explain ? (
                  <div className="mt-2 text-sm text-gray-600">解釋：{renderContent(q.explain)}</div>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="flex gap-2">
          <button onClick={restart} className="rounded bg-black px-3 py-2 text-white">
            Restart
          </button>
          <Link to="/pricing" className="rounded border px-3 py-2">
            寄送報告 ✉️
          </Link>
          <Link to="/packs" className="rounded border px-3 py-2">
            ← Back to Packs
          </Link>
        </div>
      </div>
    );
  }

  // 題目畫面
  const q = questions[idx]!;
  const a = answers[idx];

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            {packTitle ? `Quiz：${packTitle}` : `Quiz: ${slug}`}
          </h1>

          {SHOW_DEBUG && (apiUrl || debug) && (
            <div className="break-all text-xs text-gray-500">
              <span className="font-medium">source:</span> {apiUrl ?? "N/A"}
              {debug ? <> · debug: {debug}</> : null}
            </div>
          )}
        </div>

        <Link to="/packs" className="text-sm underline">
          ← Back to Packs
        </Link>
      </div>

      {/* 進度條 + 分數徽章 */}
      <div className="flex items-center justify-between">
        <div className="mr-3 flex-1">
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
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

        <motion.div
          key={score}
          initial={{ scale: 0.9, opacity: 0.6 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 12 }}
          className="relative select-none"
        >
          <div className="rounded-full border bg-white px-3 py-1 text-sm font-semibold shadow-sm">
            分數：{score} / {questions.length}
          </div>
          <AnimatePresence>
            {popPlusOne && (
              <motion.div
                initial={{ y: 8, opacity: 0, scale: 0.9 }}
                animate={{ y: -16, opacity: 1, scale: 1 }}
                exit={{ opacity: 0, y: -28 }}
                transition={{ duration: 0.6 }}
                className="absolute -right-3 -top-3 font-bold text-emerald-600"
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
              const picked = a != null;
              const active = a === i;
              return (
                <motion.button
                  key={i}
                  onClick={() => pickMCQ(i)}
                  disabled={picked && !active}
                  whileTap={{ scale: 0.98 }}
                  whileHover={{ scale: picked ? 1 : 1.01 }}
                  className={`flex items-start gap-2 rounded border p-3 text-left hover:bg-gray-50 ${
                    active ? "border-black ring-1 ring-black" : ""
                  } ${picked && !active ? "pointer-events-none opacity-50" : ""}`}
                >
                  <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full border text-sm font-semibold">
                    {"ABCD"[i]}
                  </span>
                  <span className="flex-1 break-words whitespace-normal">{renderContent(text)}</span>
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
              disabled={a !== null && a !== undefined && a !== true}
              className={`rounded border px-3 py-2 ${
                a === true ? "border-black ring-1 ring-black" : "hover:bg-gray-50"
              } ${a !== null && a !== undefined && a !== true ? "pointer-events-none opacity-50" : ""}`}
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
              } ${a !== null && a !== undefined && a !== false ? "pointer-events-none opacity-50" : ""}`}
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
              const used = new Set(
                (a as Array<number | null>).filter((x, j) => j !== li && x != null) as number[]
              );
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
        <button onClick={prevQ} disabled={idx === 0} className="rounded border px-3 py-2 disabled:opacity-50">
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

        <button onClick={nextQ} className="rounded bg-black px-3 py-2 text-white">
          {idx < questions.length - 1 ? "Next →" : "Finish ✅"}
        </button>
      </div>
    </div>
  );
}
