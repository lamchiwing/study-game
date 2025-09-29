import React from "react";
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

  useEffect(() => {
    if (slug) fetchQuestions(slug).then(setQs);
  }, [slug]);

  const current = qs[idx];

  const score = useMemo(() => {
    return qs.reduce((s, q, i) => {
      const a = answers[i];
      if (a == null) return s;
      const ri = "ABCD".indexOf((q.answer || "").trim().toUpperCase());
      return s + (ri === a ? 1 : 0);
    }, 0);
  }, [answers, qs]);

  function choose(i: number) {
    const next = answers.slice();
    next[idx] = i;
    setAnswers(next);
  }

  function nextQ() {
    if (idx + 1 < qs.length) setIdx(idx + 1);
    else setDone(true);
  }

  if (!current && !done) return <div className="p-6">Loading…</div>;

  if (done) {
    const total = qs.length;
    const correct = score;
    const wrong = total - correct;
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <h1
          style={{
            fontSize: "clamp(22px, 3vw, 28px)",
            fontWeight: 700,
            lineHeight: 1.3,
            marginBottom: 8,
          }}
        >
          完成！
        </h1>
        <p style={{ marginBottom: 16 }}>
          總題數：{total}　✅ 正確：{correct}　❌ 錯誤：{wrong}
        </p>
        <a href="/packs" className="underline">
          返回題包列表
        </a>
      </div>
    );
  }

  const rightIndex = "ABCD".indexOf((current.answer || "").trim().toUpperCase());
  const picked = answers[idx];

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-2 text-sm opacity-70">{slug}</div>

      {/* 題目：加大加粗，行距舒適 */}
      <h1
        style={{
          fontSize: "clamp(22px, 3vw, 28px)",
          fontWeight: 700,
          lineHeight: 1.3,
          marginBottom: 16,
        }}
      >
        Q{idx + 1}. <ColorText text={current.question} />
      </h1>

      {/* 選項清單：加大字體、擴大觸控區、按壓回饋 */}
      <div style={{ display: "grid", gap: 12 }}>
        {current.choices.map((c, i) => {
          const isPicked = picked === i;
          const isRight = rightIndex === i;

          const baseStyle: React.CSSProperties = {
            width: "100%",
            textAlign: "left",
            padding: "14px 16px",
            borderRadius: 12,
            border: "1px solid #ccc",
            fontSize: "18px",
            fontWeight: 600,
            minHeight: 48, // 保證觸控高度
            lineHeight: 1.3,
            background: isPicked ? "rgba(0,0,0,0.05)" : "transparent",
            transition:
              "background 120ms, transform 80ms, border-color 120ms, color 120ms",
          };

          if (picked != null) {
            if (isRight)
              Object.assign(baseStyle, {
                color: "#16a34a",
                borderColor: "#16a34a",
              }); // green-600
            else if (isPicked)
              Object.assign(baseStyle, {
                color: "#dc2626",
                borderColor: "#dc2626",
              }); // red-600
          }

          return (
            <button
              key={i}
              onClick={() => choose(i)}
              style={baseStyle}
              onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.99)")}
              onMouseUp={(e) => (e.currentTarget.style.transform = "")}
              onTouchStart={(e) => (e.currentTarget.style.transform = "scale(0.99)")}
              onTouchEnd={(e) => (e.currentTarget.style.transform = "")}
            >
              <span style={{ marginRight: 8 }}>
                {String.fromCharCode(65 + i)}.
              </span>
              <ColorText text={c} />
            </button>
          );
        })}
      </div>

      {/* 控制列 */}
      <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={nextQ}
          className="px-4 py-2 rounded-xl border"
          style={{ minHeight: 44 }}
        >
          下一題
        </button>
        <div className="text-sm opacity-70">
          {idx + 1} / {qs.length}
        </div>
      </div>

      {/* 解釋卡片 */}
      {picked != null && (
        <div className="mt-4 p-3 rounded-xl border">
          {picked === rightIndex ? (
            "✅ 回答正確"
          ) : (
            <div>
              ❌ 回答錯誤，正確是：{["A", "B", "C", "D"][rightIndex] || "—"}
            </div>
          )}
          {current.explain && (
            <div className="mt-2 text-sm opacity-80">
              解釋：<ColorText text={current.explain} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
