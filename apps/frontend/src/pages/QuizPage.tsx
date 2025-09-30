// apps/frontend/src/pages/QuizPage.tsx
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

type Question = {
  id: string | number;
  question: string;
  image?: string;
  choiceA?: string;
  choiceB?: string;
  choiceC?: string;
  choiceD?: string;
  answer?: string;  // "A" | "B" | "C" | "D" 或者是正確選項的文字
  explain?: string;
};

type QuizResponse = { questions: Question[] } | Question[];

// 依序嘗試多個候選 URL，第一個 200/OK 就用；404 會嘗試下一個
async function fetchFirstOk<T = any>(paths: string[]): Promise<T> {
  for (const url of paths) {
    try {
      const r = await fetch(url);
      if (r.ok) return r.json();
      if (r.status === 404) continue;
      throw new Error(`HTTP ${r.status} @ ${url}`);
    } catch {
      // 連線層錯誤（DNS/網路）→ 試下一個
      continue;
    }
  }
  throw new Error(`All candidates failed/404:\n${paths.join("\n")}`);
}

// 比較是否答對：優先比對字母，其次比對文字
function isCorrect(q: Question, pickedLetter: string | null | undefined): boolean {
  if (!pickedLetter) return false;
  const norm = (s: string) => s.trim().toLowerCase();

  const ans = (q.answer ?? "").trim();
  const picked = pickedLetter.trim().toUpperCase();
  const valid = new Set(["A", "B", "C", "D"]);

  if (valid.has(ans.toUpperCase())) {
    return ans.toUpperCase() === picked;
  }

  // 後端若用「正確文字」而非字母
  const pickedText = (q as any)[`choice${picked}`] as string | undefined;
  if (!pickedText) return false;
  return norm(ans) === norm(pickedText);
}

export default function QuizPage() {
  const [sp] = useSearchParams();
  const slug = sp.get("slug") ?? "";

  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [current, setCurrent] = useState(0);
  const [picked, setPicked] = useState<(string | null)[]>([]);
  const [showResults, setShowResults] = useState(false);

  // 讀題目
  useEffect(() => {
    if (!slug) {
      setError("Missing slug");
      setLoading(false);
      return;
    }

    const BASE =
      (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, "") ?? "";
    const q = `quiz?slug=${encodeURIComponent(slug)}`;

    const candidates = [
      `${BASE}/${q}`,
      `${BASE}/api/${q}`,
      "https://study-game-back.onrender.com/" + q,
      "https://study-game-back.onrender.com/api/" + q,
    ].filter(Boolean);

    setLoading(true);
    setError(null);

    fetchFirstOk<QuizResponse>(candidates)
      .then((data) => {
        const list = Array.isArray(data) ? data : data?.questions ?? [];
        setQuestions(list);
        setPicked(Array(list.length).fill(null));
        setCurrent(0);
        setShowResults(false);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [slug]);

  // 計分
  const { correctCount, total } = useMemo(() => {
    const totalQ = questions.length;
    const correct = questions.reduce((acc, q, i) => acc + (isCorrect(q, picked[i]) ? 1 : 0), 0);
    return { correctCount: correct, total: totalQ };
  }, [questions, picked]);

  // UI handlers
  const choose = (letter: "A" | "B" | "C" | "D") => {
    setPicked((prev) => {
      const next = prev.slice();
      next[current] = letter;
      return next;
    });
  };

  const next = () => {
    if (current < questions.length - 1) setCurrent(current + 1);
    else setShowResults(true);
  };

  const prev = () => {
    if (current > 0) setCurrent(current - 1);
  };

  const restart = () => {
    setPicked(Array(questions.length).fill(null));
    setCurrent(0);
    setShowResults(false);
  };

  // 畫面狀態
  if (loading) return <div className="p-8">Loading quiz…</div>;
  if (error) return <div className="p-8 text-red-600">Error: {error}</div>;

  if (!questions.length) {
    return (
      <div className="p-8 space-y-4">
        <h1 className="text-2xl font-semibold">Quiz: {slug}</h1>
        <p>No questions.</p>
        <Link to="/packs" className="inline-block rounded bg-black px-3 py-2 text-white">
          ← Back to Packs
        </Link>
      </div>
    );
  }

  if (showResults) {
    const percent = total ? Math.round((correctCount / total) * 100) : 0;
    return (
      <div className="p-8 space-y-6">
        <h1 className="text-2xl font-semibold">Result</h1>
        <div className="text-lg">
          Score: <span className="font-semibold">{correctCount}</span> / {total} ({percent}%)
        </div>

        <div className="space-y-4">
          {questions.map((q, i) => {
            const chosen = picked[i];
            const ok = isCorrect(q, chosen);
            const choiceText =
              chosen ? (q as any)[`choice${chosen}`] as string | undefined : undefined;

            return (
              <div
                key={q.id ?? i}
                className={`rounded border p-4 ${ok ? "border-emerald-400 bg-emerald-50" : "border-red-300 bg-red-50"}`}
              >
                <div className="mb-1 text-sm text-gray-500">Q{i + 1}</div>
                <div className="mb-2 font-medium">{q.question}</div>
                {q.image ? (
                  <img src={q.image} alt="" className="mb-3 max-h-64 rounded" />
                ) : null}
                <div className="text-sm">
                  Your answer: {chosen ? `${chosen}. ${choiceText ?? ""}` : <em>—</em>}
                </div>
                {!ok && q.answer ? (
                  <div className="text-sm">
                    Correct: <span className="font-semibold">{q.answer}</span>
                  </div>
                ) : null}
                {q.explain ? (
                  <div className="mt-2 text-sm text-gray-600">Explanation: {q.explain}</div>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="flex gap-2">
          <button onClick={restart} className="rounded bg-black px-3 py-2 text-white">
            Restart
          </button>
          <Link to="/packs" className="rounded border px-3 py-2">
            ← Back to Packs
          </Link>
        </div>
      </div>
    );
  }

  // 題目畫面
  const q = questions[current];
  const chosen = picked[current];
  const letters: Array<"A" | "B" | "C" | "D"> = ["A", "B", "C", "D"];
  const options = letters
    .map((L) => ({ L, text: (q as any)[`choice${L}`] as string | undefined }))
    .filter((o) => Boolean(o.text));

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Quiz: {slug}</h1>
        <Link to="/packs" className="text-sm underline">
          ← Back to Packs
        </Link>
      </div>

      <div className="text-sm text-gray-500">
        Question {current + 1} / {questions.length}
      </div>

      <div className="rounded-lg border p-5">
        <div className="mb-3 font-medium">{q.question}</div>
        {q.image ? (
          <img src={q.image} alt="" className="mb-4 max-h-72 rounded" />
        ) : null}

        <div className="grid gap-2">
          {options.map(({ L, text }) => {
            const active = chosen === L;
            return (
              <button
                key={L}
                onClick={() => choose(L)}
                className={`flex items-start gap-2 rounded border p-3 text-left hover:bg-gray-50 ${
                  active ? "border-black ring-1 ring-black" : ""
                }`}
              >
                <span className="mt-0.5 inline-block min-w-5 rounded-full border px-2 text-sm font-semibold">
                  {L}
                </span>
                <span>{text}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={prev}
          disabled={current === 0}
          className="rounded border px-3 py-2 disabled:opacity-50"
        >
          ← Prev
        </button>
        <div className="text-sm text-gray-600">
          {chosen ? `Selected: ${chosen}` : "Select an answer"}
        </div>
        <button
          onClick={next}
          className="rounded bg-black px-3 py-2 text-white"
        >
          {current < questions.length - 1 ? "Next →" : "Finish ✅"}
        </button>
      </div>
    </div>
  );
}
