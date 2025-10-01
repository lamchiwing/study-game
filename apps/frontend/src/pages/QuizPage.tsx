// apps/frontend/src/pages/QuizPage.tsx
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { fetchQuestions, type Question as RawQuestion } from "../lib/api";
import ColorText from "../components/ColorText";

/** 以 ColorText 為核心的可插拔渲染 */
function renderContent(text?: string) {
  if (!text) return null;
  return <ColorText text={text} />;
}

/* =========================
   資料模型（正規化後）
   ========================= */
type QBase = {
  id: string | number;
  stem: string;
  image?: string;
  explain?: string;
};

type QMCQ = QBase & {
  type: "mcq";
  choices: string[];               // 顯示用
  answerLetter?: "A" | "B" | "C" | "D";
  answerText?: string;             // 若後端給文字答案
};

type QTF = QBase & {
  type: "tf";
  answerBool: boolean;
};

type QFill = QBase & {
  type: "fill";
  acceptable: string[];            // 可接受答案（大小寫無關、trim 比對）
};

type QMatch = QBase & {
  type: "match";
  left: string[];                  // 左側題幹
  right: string[];                 // 右側選項（同值不同序）
  answerMap: number[];             // answerMap[i] = 正確 right 索引
};

type NormQ = QMCQ | QTF | QFill | QMatch;

/* =========================
   工具：將 fetchQuestions 回傳的任意結構 → NormQ
   ========================= */
const toUpper = (s?: string) => (s ?? "").trim().toUpperCase();
const normStr = (s?: string) => (s ?? "").trim().toLowerCase();

function normalizeOne(raw: any, index: number): NormQ {
  // 嘗試辨識 type/ kind
  const t = String(raw.type ?? raw.kind ?? raw.questionType ?? "").toLowerCase();

  // 共通欄位
  const base: QBase = {
    id: raw.id ?? index,
    stem: raw.question ?? raw.stem ?? "",
    image: raw.image,
    explain: raw.explain ?? raw.explanation,
  };

  // 1) MATCH：優先判斷（若有 pairs / left+right）
  if (Array.isArray(raw.pairs) && raw.pairs.length) {
    const left = raw.pairs.map((p: any) => p.left);
    const right = raw.pairs.map((p: any) => p.right);
    const answerMap = left.map((l: string) => right.findIndex((r: string) => normStr(r) === normStr(raw.pairs.find((p: any) => p.left === l)?.right)));
    return { ...base, type: "match", left, right, answerMap };
  }
  if (Array.isArray(raw.left) && Array.isArray(raw.right) && Array.isArray(raw.answerMap)) {
    return { ...base, type: "match", left: raw.left, right: raw.right, answerMap: raw.answerMap.map((x: any) => Number(x)) };
  }

  // 2) TF（顯式 type 或答案為 True/False）
  const ansUp = toUpper(raw.answer);
  if (t === "tf" || t === "truefalse" || ansUp === "T" || ansUp === "F" || ansUp === "TRUE" || ansUp === "FALSE" || typeof raw.answerBool === "boolean") {
    const answerBool =
      typeof raw.answerBool === "boolean"
        ? raw.answerBool
        : ansUp === "T" || ansUp === "TRUE";
    return { ...base, type: "tf", answerBool };
  }

  // 3) FILL（顯式 type 或沒有 choices 但有 answer 文本／answers 陣列）
  const hasChoicesArray = Array.isArray(raw.choices) && raw.choices.length > 0;
  const hasChoiceFields = ["choiceA", "choiceB", "choiceC", "choiceD"].some((k) => raw[k]);
  if (t === "fill" || (!hasChoicesArray && !hasChoiceFields && (raw.answer || raw.answers))) {
    const acceptable = Array.isArray(raw.answers)
      ? raw.answers.map(normStr)
      : String(raw.answer ?? "")
          .split("|")
          .map(normStr)
          .filter(Boolean);
    return { ...base, type: "fill", acceptable };
  }

  // 4) MCQ（預設）
  const choices: string[] = hasChoicesArray
    ? raw.choices
    : ["choiceA", "choiceB", "choiceC", "choiceD"]
        .map((k) => raw[k])
        .filter(Boolean);

  const letter = toUpper(raw.answer);
  const answerLetter = (["A", "B", "C", "D"] as const).includes(letter as any) ? (letter as "A" | "B" | "C" | "D") : undefined;
  const answerText = !answerLetter ? String(raw.answer ?? "").trim() : undefined;

  return {
    ...base,
    type: "mcq",
    choices,
    answerLetter,
    answerText,
  };
}

function normalize(rawList: RawQuestion[] | any[]): NormQ[] {
  return (rawList ?? []).map((r, i) => normalizeOne(r, i));
}

/* =========================
   檢查正確性
   ========================= */
function isCorrect(q: NormQ, ans: any): boolean {
  switch (q.type) {
    case "mcq": {
      if (ans == null || typeof ans !== "number") return false;
      if (q.answerLetter) {
        const idx = "ABCD".indexOf(q.answerLetter);
        return idx === ans;
      }
      if (q.answerText) {
        const txt = q.choices[ans] ?? "";
        return normStr(q.answerText) === normStr(txt);
      }
      return false;
    }
    case "tf":
      return typeof ans === "boolean" ? ans === q.answerBool : false;
    case "fill":
      if (typeof ans !== "string") return false;
      const a = normStr(ans);
      return q.acceptable.some((acc) => a === acc);
    case "match":
      if (!Array.isArray(ans) || ans.length !== q.left.length) return false;
      return ans.every((v, i) => Number(v) === q.answerMap[i]);
  }
}

/* =========================
   UI 元件
   ========================= */
export default function QuizPage() {
  const [sp] = useSearchParams();
  const slug = sp.get("slug") ?? "";

  const [questions, setQuestions] = useState<NormQ[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [idx, setIdx] = useState(0);
  // 各型別對應的答案型態：
  // mcq: number|null, tf: boolean|null, fill: string, match: (number|null)[]
  const [answers, setAnswers] = useState<any[]>([]);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!slug) {
      setError("Missing slug");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    fetchQuestions(slug)
      .then((raw: any) => {
        const list = Array.isArray(raw?.questions) ? raw.questions : raw;
        const qs = normalize(list);
        setQuestions(qs);
        setIdx(0);
        setDone(false);
        // 初始化答案
        setAnswers(
          qs.map((q) => {
            if (q.type === "mcq") return null as number | null;
            if (q.type === "tf") return null as boolean | null;
            if (q.type === "fill") return "" as string;
            if (q.type === "match") return Array(q.left.length).fill(null) as Array<number | null>;
            return null;
          })
        );
      })
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [slug]);

  // 計分
  const { score, total } = useMemo(() => {
    const totalQ = questions.length;
    const s = questions.reduce((acc, q, i) => acc + (isCorrect(q, answers[i]) ? 1 : 0), 0);
    return { score: s, total: totalQ };
  }, [questions, answers]);

  // Handlers
  function pickMCQ(i: number) {
    setAnswers((prev) => {
      const next = prev.slice();
      next[idx] = i;
      return next;
    });
  }
  function pickTF(val: boolean) {
    setAnswers((prev) => {
      const next = prev.slice();
      next[idx] = val;
      return next;
    });
  }
  function fillText(text: string) {
    setAnswers((prev) => {
      const next = prev.slice();
      next[idx] = text;
      return next;
    });
  }
  function pickMatch(leftIndex: number, rightIndex: number | null) {
    setAnswers((prev) => {
      const next = prev.slice();
      const arr = (next[idx] as Array<number | null>).slice();
      arr[leftIndex] = rightIndex;
      next[idx] = arr;
      return next;
    });
  }

  function nextQ() {
    if (idx + 1 < questions.length) setIdx(idx + 1);
    else setDone(true);
  }
  function prevQ() {
    if (idx > 0) setIdx(idx - 1);
  }
  function restart() {
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
  }

  // 畫面狀態
  if (loading) return <div className="p-6">Loading…</div>;
  if (error) return <div className="p-6 text-red-600">Error: {error}</div>;
  if (!questions.length)
    return (
      <div className="p-6 space-y-3">
        <h1 className="text-2xl font-semibold">Quiz: {slug}</h1>
        <p>No questions.</p>
        <Link to="/packs" className="underline">
          ← Back to Packs
        </Link>
      </div>
    );

  // 完成頁
  if (done) {
    const wrong = total - score;
    const percent = total ? Math.round((score / total) * 100) : 0;
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold">完成！</h1>
        <p>
          總題數：{total}　✅ 正確：{score}　❌ 錯誤：{wrong}（{percent}%）
        </p>

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

                {/* 顯示作答與正解（依型別） */}
                <div className="text-sm">
                  你的答案：
                  {" "}
                  {(() => {
                    const a = answers[i];
                    switch (q.type) {
                      case "mcq":
                        return a != null ? (
                          <>
                            {["A", "B", "C", "D"][a as number]}. {renderContent(q.choices[a as number])}
                          </>
                        ) : <em>—</em>;
                      case "tf":
                        return a == null ? <em>—</em> : (a ? "True" : "False");
                      case "fill":
                        return (a as string)?.trim() ? renderContent(String(a)) : <em>—</em>;
                      case "match":
                        return (
                          <ul className="mt-1 list-disc pl-5">
                            {q.left.map((L, li) => {
                              const ri = (a as Array<number | null>)[li];
                              const R = ri != null ? q.right[ri] : "—";
                              return <li key={li}>{renderContent(L)} {" → "} {renderContent(R)}</li>;
                            })}
                          </ul>
                        );
                    }
                  })()}
                </div>

                {/* 正解 / 解釋 */}
                <div className="mt-2 text-sm">
                  {!ok && (
                    <>
                      正確答案：
                      {" "}
                      {q.type === "mcq" && (
                        q.answerLetter
                          ? `${q.answerLetter}. ${q.choices["ABCD".indexOf(q.answerLetter)]}`
                          : q.answerText
                      )}
                      {q.type === "tf" && (q.answerBool ? "True" : "False")}
                      {q.type === "fill" && q.acceptable.join(" | ")}
                      {q.type === "match" && (
                        <ul className="mt-1 list-disc pl-5">
                          {q.left.map((L, li) => {
                            const ri = q.answerMap[li];
                            const R = q.right[ri];
                            return <li key={li}>{renderContent(L)} {" → "} {renderContent(R)}</li>;
                          })}
                        </ul>
                      )}
                    </>
                  )}
                  {q.explain ? (
                    <div className="mt-2 text-gray-600">
                      解釋：{renderContent(q.explain)}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex gap-2">
          <button onClick={restart} className="rounded bg-black px-3 py-2 text-white">
            再做一次
          </button>
          <Link to="/packs" className="rounded border px-3 py-2">
            ← 返回題包列表
          </Link>
        </div>
      </div>
    );
  }

  // 題目頁
  const q = questions[idx]!;
  const a = answers[idx];

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Quiz: {slug}</h1>
        <Link to="/packs" className="text-sm underline">← Back to Packs</Link>
      </div>

      <div className="text-sm text-gray-500">Question {idx + 1} / {questions.length}</div>

      <div className="rounded-lg border p-5">
        <div className="mb-3 font-medium">{renderContent(q.stem)}</div>
        {q.image ? <img src={q.image} alt="" className="mb-4 max-h-72 rounded" /> : null}

        {/* 依型別渲染互動區 */}
        {q.type === "mcq" && (
          <div className="grid gap-2">
            {q.choices.map((text, i) => {
              const active = a === i;
              return (
                <button
                  key={i}
                  onClick={() => pickMCQ(i)}
                  className={`flex items-start gap-2 rounded border p-3 text-left hover:bg-gray-50 ${active ? "border-black ring-1 ring-black" : ""}`}
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
              className={`rounded border px-3 py-2 ${a === true ? "border-black ring-1 ring-black" : ""}`}
            >
              True
            </button>
            <button
              onClick={() => pickTF(false)}
              className={`rounded border px-3 py-2 ${a === false ? "border-black ring-1 ring-black" : ""}`}
            >
              False
            </button>
          </div>
        )}

        {q.type === "fill" && (
          <div className="flex gap-2">
            <input
              value={a as string}
              onChange={(e) => fillText(e.target.value)}
              placeholder="你的答案…"
              className="w-full rounded border px-3 py-2"
            />
          </div>
        )}

        {q.type === "match" && (
          <div className="grid gap-3">
            {q.left.map((L, li) => {
              const chosen = (a as Array<number | null>)[li];
              // 禁用已被其他 left 選走的 right（避免重複配對）
              const used = new Set((a as Array<number | null>).filter((x, i2) => i2 !== li && x != null) as number[]);
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
                    {q.right.map((R, ri) => (
                      <option key={ri} value={ri} disabled={used.has(ri)}>
                        {renderContent(R) as any /* TSX option 內直接放 ReactNode 會警告，這行為簡化展示 */}
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
          ← 上一題
        </button>
        <div className="text-sm text-gray-600">
          {q.type === "fill"
            ? (a as string)?.trim()
              ? "已填寫"
              : "請填寫答案"
            : a == null || (Array.isArray(a) && a.some((x) => x == null))
            ? "請選擇答案"
            : "已選擇"}
        </div>
        <button onClick={nextQ} className="rounded bg-black px-3 py-2 text-white">
          {idx < questions.length - 1 ? "下一題 →" : "完成 ✅"}
        </button>
      </div>
    </div>
  );
}
