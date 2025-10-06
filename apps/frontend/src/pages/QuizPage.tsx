import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { fetchQuestions as _fetchQuestions } from "../lib/api";

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

  // MATCH（高韌性解析）
  if (Array.isArray(raw.pairs) || typeof raw.pairs === "string") {
    try {
      let s: any = raw.pairs;

      if (Array.isArray(s)) {
        // ok
      } else if (typeof s === "string") {
        s = s.trim();
        if (s.startsWith("'") && s.endsWith("'")) s = s.slice(1, -1); // 去單引號殼
        if (s.includes('""')) s = s.replace(/""/g, '"');              // CSV 內部 "" → "
        s = JSON.parse(s);
        if (typeof s === "string" && s.trim().startsWith("[")) s = JSON.parse(s); // 雙重 JSON
      }

      const okArray =
        Array.isArray(s) && s.every((x) => x && typeof x === "object" && "left" in x && "right" in x);

      if (okArray) {
        const arr = s as Array<{ left: string; right: string }>;
        const left = arr.map((p) => p.left);
        const right = arr.map((p) => p.right);
        const answerMap = left.map((L) =>
          right.findIndex((R) => normStr(R) === normStr((arr.find((x) => x.left === L) as any)?.right))
        );
        return { ...base, type: "match", left, right, answerMap };
      }
    } catch {
      // fallthrough
    }
  }

  // 備援：管線字串 left/right/answerMap
  if (
    (typeof raw.left === "string" && typeof raw.right === "string") ||
    typeof raw.answerMap === "string"
  ) {
    const left = String(raw.left ?? "")
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean);
    const right = String(raw.right ?? "")
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean);
    const answerMap = String(raw.answerMap ?? "")
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean)
      .map(Number);

    if (left.length && right.length && answerMap.length === left.length) {
      return { ...base, type: "match", left, right, answerMap };
    }
  }

  // 原生陣列分支（若後端就給陣列）
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
    const answerBool = typeof raw.answerBool === "boolean" ? raw.answerBool : A === "T" || A === "TRUE";
    return { ...base, type: "tf", answerBool };
  }

  // FILL（CSV：answer 欄用 pipe 連結 "yellow|黃色"）
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

/* ---------------- 頁面 ---------------- */
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
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Quiz: {slug}</h1>
          <Link to="/packs" className="text-sm underline">
            ← Back to Packs
          </Link>
        </div>
        <p>No questions.</p>
        {(apiUrl || debug) && (
          <div className="text-xs text-gray-500 break-all">
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
      <div className="p-6 max-w-3xl mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Result</h1>
          <Link to="/packs" className="text-sm underline">
            ← Back to Packs
          </Link>
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
                        ) : (
                          <em>—</em>
                        );
                      case "tf":
                        return a == null ? <em>—</em> : a ? "True" : "False";
                      case "fill":
                        return String(a ?? "").trim() ? renderContent(String(a)) : <em>—</em>;
                      case "match":
                        return (
                          <ul className="mt-1 list-disc pl-5">
                            {q.left.map((L, li) => {
                              const ri = (a as Array<number | null>)[li];
                              const R = ri != null ? q.right[ri] : "—";
                              return (
                                <li key={li}>
                                  {renderContent(L)} {" → "} {renderContent(R)}
                                </li>
                              );
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
                      (q.answerLetter
                        ? `${q.answerLetter}. ${preprocessBBCodeToHTML(q.choices["ABCD".indexOf(q.answerLetter)])}`
                        : preprocessBBCodeToHTML(
                            q.choices.find((c) => normStr(c) === normStr((q as any).answerText)) ?? ""
                          ))}
                    {q.type === "tf" && (q.answerBool ? "True" : "False")}
                    {q.type === "fill" && q.acceptable.join(" | ")}
                    {q.type === "match" && (
                      <ul className="mt-1 list-disc pl-5">
                        {q.left.map((L, li) => {
                          const ri = q.answerMap[li];
                          const R = q.right[ri];
                          return (
                            <li key={li}>
                              {renderContent(L)} {" → "} {renderContent(R)}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}

                {q.explain ? <div className="mt-2 text-sm text-gray-600">解釋：{renderContent(q.explain)}</div> : null}
              </div>
            );
          })}
        </div>

        <div className="flex gap-2">
          <button onClick={restart} className="rounded bg-black px-3 py-2 text-white">Restart</button>
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
          <h1 className="text-2xl font-semibold">Quiz: {slug}</h1>
          {(apiUrl || debug) && (
            <div className="text-xs text-gray-500 break-all">
              source: {apiUrl ?? "N/A"}
              {debug ? <> · debug: {debug}</> : null}
            </div>
          )}
        </div>
        <Link to="/packs" className="text-sm underline">← Back to Packs</Link>
      </div>

      <div className="text-sm text-gray-500">Question {idx + 1} / {questions.length}</div>

      <div className="rounded-lg border p-5">
        <div className="mb-3 font-medium">{renderContent(q.stem)}</div>
        {q.image ? <img src={q.image} alt="" className="mb-4 max-h-72 rounded" /> : null}

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
            <button onClick={() => pickTF(true)}  className={`rounded border px-3 py-2 ${a === true ? "border-black ring-1 ring-black" : ""}`}>True</button>
            <button onClick={() => pickTF(false)} className={`rounded border px-3 py-2 ${a === false ? "border-black ring-1 ring-black" : ""}`}>False</button>
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
        <button onClick={prevQ} disabled={idx === 0} className="rounded border px-3 py-2 disabled:opacity-50">← Prev</button>
        <div className="text-sm text-gray-600">
          {q.type === "fill"
            ? String(a ?? "").trim() ? "已填寫" : "請填寫答案"
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
