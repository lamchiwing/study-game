import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

type Question = {
  id: string;
  question: string;
  choiceA?: string; choiceB?: string; choiceC?: string; choiceD?: string;
  answer?: string; explain?: string;
};

export default function QuizPage() {
  const [sp] = useSearchParams();
  const slug = sp.get("slug") ?? "";
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
  if (!slug) { setError("Missing slug"); setLoading(false); return; }
  const BASE = import.meta.env.VITE_API_BASE?.replace(/\/$/, "") || "";
  const q = `quiz?slug=${encodeURIComponent(slug)}`;
  const candidates = [
    `${BASE}/${q}`,
    `${BASE}/api/${q}`,
    `https://study-game-back.onrender.com/${q}`,
    `https://study-game-back.onrender.com/api/${q}`,
  ];
  fetchFirstOk(candidates)
    .then((data) => setQuestions(data?.questions ?? data ?? []))
    .catch((e) => setError(String(e)))
    .finally(() => setLoading(false));
}, [slug]);


  if (loading) return <div style={{ padding: 24 }}>Loading quiz…</div>;
  if (error) return <div style={{ padding: 24, color: "crimson" }}>Error: {error}</div>;

  return (
    <div style={{ padding: 24 }}>
      <h1>Quiz: {slug}</h1>
      {!questions.length ? (
        <p>No questions.</p>
      ) : (
        <ol>
          {questions.map((q) => (
            <li key={q.id} style={{ marginBottom: 16 }}>
              <div>{q.question}</div>
              <ul>
                {["A","B","C","D"].map(k => {
                  const key = ("choice" + k) as keyof Question;
                  const val = q[key] as string | undefined;
                  return val ? <li key={k}>{k}. {val}</li> : null;
                })}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
