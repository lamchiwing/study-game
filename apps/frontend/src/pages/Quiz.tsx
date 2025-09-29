import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { fetchQuestions, type Question } from "../lib/api";
import ColorText from "../components/ColorText";

export default function Quiz() {
  const [search] = useSearchParams();
  const slug = search.get("slug") || "";
  const [qs, setQs] = useState<Question[]>([]);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [done, setDone] = useState(false);

  useEffect(() => { if (slug) fetchQuestions(slug).then(setQs); }, [slug]);

  const current = qs[idx];
  const score = useMemo(() => qs.reduce((s, q, i) => {
    const a = answers[i]; if (a == null) return s;
    const ri = "ABCD".indexOf((q.answer || "").trim().toUpperCase());
    return s + (ri === a ? 1 : 0);
  }, 0), [answers, qs]);

  function choose(i: number) {
    const next = answers.slice(); next[idx] = i; setAnswers(next);
  }
  function nextQ() {
    if (idx + 1 < qs.length) setIdx(idx + 1); else setDone(true);
  }

  if (!current && !done) return <div className="p-6">Loading…</div>;
  if (done) {
    const total = qs.length, correct = score, wrong = total - correct;
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">完成！</h1>
        <p className="mb-4">總題數：{total}　✅ 正確：{correct}　❌ 錯誤：{wrong}</p>
        <a href="/packs" className="underline">返回題包列表</a>
      </div>
    );
  }

  const rightIndex = "ABCD".indexOf((current.answer || "").trim().toUpperCase());
  const picked = answers[idx];

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-2 text-sm opacity-70">{slug}</div>
      <h1 className="text-xl font-semibold mb-4">
        Q{idx + 1}. <ColorText text={current.question} />
      </h1>

      <div className="space-y-2">
        {current.choices.map((c, i) => {
          const isPicked = picked === i;
          const isRight = rightIndex === i;
          const base = "w-full text-left p-3 rounded-xl border transition";
          const pickedClass = isPicked ? " bg-black/5" : "";
          const colorClass =
            picked != null
              ? isRight
                ? " text-green-600 border-green-600"
                : isPicked
                ? " text-red-600 border-red-600"
                : ""
              : "";
          return (
            <button key={i} onClick={() => choose(i)} className={`${base}${pickedClass} ${colorClass}`}>
              <span className="mr-2">{String.fromCharCode(65 + i)}.</span>
              <ColorText text={c} />
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button onClick={nextQ} className="px-4 py-2 rounded-xl border">下一題</button>
        <div className="text-sm opacity-70">{idx + 1} / {qs.length}</div>
      </div>

      {picked != null && (
        <div className="mt-4 p-3 rounded-xl border">
          {picked === rightIndex ? "✅ 回答正確" : (
            <div>❌ 回答錯誤，正確是：{["A","B","C","D"][rightIndex] || "—"}</div>
          )}
          {current.explain && <div className="mt-2 text-sm opacity-80">解釋：<ColorText text={current.explain} /></div>}
        </div>
      )}
    </div>
  );
}
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { fetchQuestions, type Question } from "../lib/api";
import ColorText from "../components/ColorText";

export default function Quiz() {
  const [search] = useSearchParams();
  const slug = search.get("slug") || "";
  const [qs, setQs] = useState<Question[]>([]);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [done, setDone] = useState(false);

  useEffect(() => { if (slug) fetchQuestions(slug).then(setQs); }, [slug]);

  const current = qs[idx];
  const score = useMemo(() => qs.reduce((s, q, i) => {
    const a = answers[i]; if (a == null) return s;
    const ri = "ABCD".indexOf((q.answer || "").trim().toUpperCase());
    return s + (ri === a ? 1 : 0);
  }, 0), [answers, qs]);

  function choose(i: number) {
    const next = answers.slice(); next[idx] = i; setAnswers(next);
  }
  function nextQ() {
    if (idx + 1 < qs.length) setIdx(idx + 1); else setDone(true);
  }

  if (!current && !done) return <div className="p-6">Loading…</div>;
  if (done) {
    const total = qs.length, correct = score, wrong = total - correct;
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">完成！</h1>
        <p className="mb-4">總題數：{total}　✅ 正確：{correct}　❌ 錯誤：{wrong}</p>
        <a href="/packs" className="underline">返回題包列表</a>
      </div>
    );
  }

  const rightIndex = "ABCD".indexOf((current.answer || "").trim().toUpperCase());
  const picked = answers[idx];

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-2 text-sm opacity-70">{slug}</div>
      <h1 className="text-xl font-semibold mb-4">
        Q{idx + 1}. <ColorText text={current.question} />
      </h1>

      <div className="space-y-2">
        {current.choices.map((c, i) => {
          const isPicked = picked === i;
          const isRight = rightIndex === i;
          const base = "w-full text-left p-3 rounded-xl border transition";
          const pickedClass = isPicked ? " bg-black/5" : "";
          const colorClass =
            picked != null
              ? isRight
                ? " text-green-600 border-green-600"
                : isPicked
                ? " text-red-600 border-red-600"
                : ""
              : "";
          return (
            <button key={i} onClick={() => choose(i)} className={`${base}${pickedClass} ${colorClass}`}>
              <span className="mr-2">{String.fromCharCode(65 + i)}.</span>
              <ColorText text={c} />
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button onClick={nextQ} className="px-4 py-2 rounded-xl border">下一題</button>
        <div className="text-sm opacity-70">{idx + 1} / {qs.length}</div>
      </div>

      {picked != null && (
        <div className="mt-4 p-3 rounded-xl border">
          {picked === rightIndex ? "✅ 回答正確" : (
            <div>❌ 回答錯誤，正確是：{["A","B","C","D"][rightIndex] || "—"}</div>
          )}
          {current.explain && <div className="mt-2 text-sm opacity-80">解釋：<ColorText text={current.explain} /></div>}
        </div>
      )}
    </div>
  );
}
