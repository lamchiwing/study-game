const API =
  (import.meta.env as any).VITE_API_BASE ||
  (import.meta.env as any).VITE_API_BASE_URL ||
  "";

export type Pack = { slug: string; count?: number | null };
export type Question = {
  id: string;
  subject: string;
  grade: string;
  topic: string;
  LO: string;
  diff: string;
  question: string;
  choices: string[];
  answer: string;
  explain: string;
};

export async function fetchPacks(): Promise<Pack[]> {
  const res = await fetch(`${API}/api/packs`);
  if (!res.ok) throw new Error("fetch packs failed");
  return res.json();
}

export async function fetchQuestions(slug: string): Promise<Question[]> {
  const res = await fetch(`${API}/api/questions?slug=${encodeURIComponent(slug)}`);
  if (!res.ok) throw new Error("fetch questions failed");
  return res.json();
}
