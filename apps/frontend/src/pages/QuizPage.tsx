// apps/frontend/src/pages/QuizPage.tsx
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import parser from "bbcode-to-react";
import { fetchQuestions as _fetchQuestions } from "../lib/api";

/* -----------------------------------------------------------
   BBCode 預處理（動態色名 + 常用語法）
   - 在全域 CSS（如 index.css）定義 :root { --c-ai: #2A4B8D; ... }
   - 文字色：[c=ai]文字[/c] → [color=var(--c-ai)]文字[/color]
   - 底色：[bgc=ai]文字[/bgc] → [color=var(--c-ai);background:var(--c-ai);class=jp-bg]文字[/color]
----------------------------------------------------------- */
function preprocessBBCode(input?: string): string {
  let text = input ?? "";

  // 舊寫法別名 → 日系色名
  text = text
    .replace(/\[red\](.*?)\[\/red\]/gis, "[c=kurenai]$1[/c]")
    .replace(/\[blue\](.*?)\[\/blue\]/gis, "[c=ai]$1[/c]")
    .replace(/\[green\](.*?)\[\/green\]/gis, "[c=wakaba]$1[/c]")
    .replace(/\[yellow\](.*?)\[\/yellow\]/gis, "[c=yamabuki]$1[/c]");

  // 動態字色
  text = text.replace(/\[c=([a-z0-9_-]+)\](.*?)\[\/c\]/gis, (_m, token, body) => {
    return `[color=var(--c-${token})]${body}[/color]`;
  });

  // 底色
  text = text.replace(/\[bgc=([a-z0-9_-]+)\](.*?)\[\/bgc\]/gis, (_m, token, body) => {
    return `[color=var(--c-${token});background:var(--c-${token});class=jp-bg;data-c=${token}]${body}[/color]`;
  });

  // 字級（可選）
  text = text.replace(/\[size=(\d+)\](.*?)\[\/size\]/gis, (_m, n, s) => {
    return `[color=inherit;font-size:${Number(n)}px]${s}[/color]`;
  });

  // 上標 / 下標
  text = text
    .replace(/\[sup\](.*?)\[\/sup\]/gis, `[color=inherit;vertical-align:super;font-size:.75em]$1[/color]`)
    .replace(/\[sub\](.*?)\[\/sub\]/gis, `[color=inherit;vertical-align:sub;font-size:.75em]$1[/color]`);

  return text;
}

// 給 <option> / 純文字環境用：移除 BBCode
function stripBBCode(input?: string) {
  const t = preprocessBBCode(input);
  return t
    .replace(/\[\/?\w+(?:=[^\]]+)?\]/g, "")
    .replace(/<[^>]+>/g, "")
    .trim();
}

// ========== 可插拔渲染：BBCode ==========
function renderContent(text?: string) {
  if (!text) return null;
  const bb = preprocessBBCode(text);
  return <span>{parser.toReact(bb)}</span>;
}

// ========== 正規化資料模型 ==========
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
type QMatch = QBase & {
  type: "match";
  left: string[];
  right: string[];
  answerMap: number[];
};

type NormQ = QMCQ | QTF | QFill | QMatch;

const normStr = (s?: string) => (s ?? "").trim().toLowerCase();
const up = (s?: string) => (s ?? "").trim().toUpperCase();

function normalizeOne(raw: Raw, i: number): NormQ {
  const typeHint = String(raw.type ?? raw.kind ?? raw.questionType ?? "").toLowerCase();
  const base: QBase = {
    id: raw.id ?? i,
    stem: raw.question ?? raw.stem ?? "",
    image: raw.image,
    explain: raw.explain ?? raw.explanation,
  };

  // MATCH
  if (Array.isArray(raw.pairs) || typeof raw.pairs === "string") {
    try {
      const arr = typeof raw.pairs === "string" ? JSON.parse(raw.pairs) : (raw.pairs as any[]);
      const left = arr.map((p: any) => p.left);
      const right = arr.map((p: any) => p.right);
      const answerMap = left.map((L: string) =>
        right.findIndex(
          (R: string) => normStr(R) === normStr(arr.find((x: any) => x.left === L)?.right)
        )
      );
      return { ...base, type: "match", left, right, answerMap };
    } catch {
      /* ignore */
    }
  }
  if (Array.isArray(raw.left) && Array.isArray(raw.right) && Array.isArray(raw.answerMap)) {
    return {
      ...base,
      type: "match",
      left: raw.left,
      right: raw.right,
      answerMap: raw.answerMap.map((n: any) => Number(n)),
    };
  }

  // TF
  const A = up(raw.answer);
  if (
    typeHint === "tf" ||
    typeHint === "truefalse" ||
    A === "T" ||
    A === "F" ||
    A === "TRUE" ||
    A === "FALSE" ||
    typeof raw.answerBool === "boolean"
  ) {
    const answerBool =
      typeof raw.answerBool === "boolean" ? raw.answerBool : A === "T" || A === "TRUE";
    return { ...base, type: "tf", answerBool };
  }

  // FILL
  const hasChoices =
    (Array.isArray(raw.choices) && raw.choices.length > 0) ||
    ["choiceA", "choiceB", "choiceC", "choiceD"].some((k) => raw[k]);
  if (typeHint === "fill" || (!hasChoices && (raw.answer || raw.answers))) {
    const acceptable = Array.isArray(raw.answers)
      ? raw.answers.map(normStr)
      : String(raw.answer ?? "")
          .split("|")
          .map(normStr)
          .filter(Boolean);
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
  const list = Array.isArray(raw) ? raw : (raw as any)?.questions;
  if (!Array.isArray(list)) return [];
  return list.map(normalizeOne);
}

// ========== 判斷正確 ==========
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

// ========== 頁面主體 ==========
export default function QuizPage() {
  const [sp] = useSearchParams();
  const slug = sp.get("slug") ?? "";

  const [questions, setQuestions] = useState<NormQ[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiUrl, setApiUrl] = useState<string | undefined>();
  const [debug, setDebug] = useState<string | undefined>();
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<any[]>([]);
  const [done, setDone] = useState(false);

  // 讀題目
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
        const list = normalizeList(ret?.list ?? ret);
        setQuestions(list);
        setAnswers(
          list.map((q) => {
            if (q.type === "mcq") return null;
            if (q.type === "tf") return null;
            if (q.type === "fill") return "";
            if (q.type === "match") return Array(q.left.length).fill(null);
            return null;
          })
        );
        setIdx(0);
        setApiUrl(ret?.usedUrl);
        setDebug(ret?.debug);
      } catch (e: any) {
        console.warn("fetchQuestions failed:", e);
        setQuestions([]);
        setApiUrl(undefined);
        setDebug(String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  const { score, total } = useMemo(() => {
    const totalQ = questions.length;
    const s = questions.reduce((acc, q, i) => acc + (isCorrect(q, answers[i]) ? 1 : 0), 0);
    return { score: s, total: totalQ };
  }, [questions, answers]);

  const pickMCQ = (i: number) =>
    setAnswers((prev) => {
      const next = prev.slice();
      next[idx] = i;
      return next;
    });
  const pickTF = (b: boolean) =>
    setAnswers((prev) => {
      const next = prev.slice();
      next[idx] = b;
      return next;
    });
  const fillText = (text: string) =>
    setAnswers((prev) => {
      const next = prev.slice();
      next[idx] = text;
      return next;
    });
  const pickMatch = (li: number, ri: number | null) =>
    setAnswers((prev) => {
      const next = prev.slice();
      const arr = (next[idx] as Array<number | null>).slice();
      arr[li] = ri;
      next[idx] = arr;
      return next;
    });

  const nextQ = () => (idx + 1 < questions.length ? setIdx(idx + 1) : setDone(true));
  const prevQ = () => idx > 0 && setIdx(idx - 1);
  const restart = () => {
    setAnswers(
      questions.map((q) => {
        if (q.type === "mcq") return null;
        if (q.type === "tf") return null;
        if (q.type === "fill") return "";
        if (q.type === "match") return Array(q.left.length).fill(null);
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
        <h1 className="text-2xl font-semibold">Quiz: {slug}</h1>
        <p>No questions.</p>
      </div>
    );
  }

  if (done) {
    const percent = total ? Math.round((score / total) * 100) : 0;
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-5">
        <h1 className="text-2xl font-semibold">Result</h1>
        <div className="text-lg">
          Score: <span className="font-semibold">{score}</span> / {total} ({percent}%)
        </div>
        <div className="flex gap-2">
          <button onClick={restart} className="rounded bg-black px-3 py-2 text-white">
            Restart
          </button>
          <Link to="/packs" className="rounded border px-3 py-2">
            ← Back
          </Link>
        </div>
      </div>
    );
  }

  const q = questions[idx]!;
  const a = answers[idx];

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-semibold">Quiz: {slug}</h1>
      <div className="text-sm text-gray-500">
        Question {idx + 1} / {questions.length}
      </div>

      <div className="rounded-lg border p-5">
        <div className="mb-3 font-medium">{renderContent(q.stem)}</div>
        {q.image && <img src={q.image} alt="" className="mb-4 max-h-72 rounded" />}

        {q.type === "mcq" && (
          <div className="grid gap-2">
            {q.choices.map((text, i) => {
              const active = a === i;
              return (
                <button
                  key={i}
                  onClick={() => pickMCQ(i)}
                  className={`flex items-start gap-2 rounded border p-3 text-left hover:bg-gray-50 ${
                    active ? "border-black ring-1 ring-black" : ""
                  }`}
                >
                  <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full border text-sm font-semibold">
                    {"ABCD"[i]}
                  </span>
                  <span>{renderContent(text)}</span>
                </button>
              );
            })}
          </div>
        )}

        {q.type === "tf" && (
          <div className="flex gap-2">
            <button
              onClick={() => pickTF(true)}
              className={`rounded border px-3 py-2 ${
                a === true ? "border-black ring-1 ring-black" : ""
              }`}
            >
              True
            </button>
            <button
              onClick={() => pickTF(false)}
              className={`rounded border px-3 py-2 ${
                a === false ? "border-black ring-1 ring-black" : ""
              }`}
            >
              False
            </button>
          </div>
        )}

        {q.type === "fill" && (
          <input
            value={a as string}
            onChange={(e) => fillText(e.target.value)}
            placeholder="你的答案…"
            className="w-full rounded border px-3 py-2"
          />
        )}

        {q.type === "match" && (
          <div className="grid gap-3">
            {q.left.map((L, li) => {
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
                    onChange={(e) =>
                      pickMatch(li, e.target.value === "" ? null : Number(e.target.value))
                    }
                  >
                    <option value="">請選擇</option>
                    {q.right.map((R, ri) => (
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
        <button onClick={nextQ} className="rounded bg-black px-3 py-2 text-white">
          {idx < questions.length - 1 ? "Next →" : "Finish ✅"}
        </button>
      </div>
    </div>
  );
}
