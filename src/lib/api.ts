const API = import.meta.env.VITE_API_BASE || "https://study-game-back.onrender.com";


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
  image?: string; // ← 可選
};

export type Pack = { slug: string; count?: number | null };

export async function fetchPacks(): Promise<Pack[]> {
  const res = await fetch(`${API}/api/packs`, { credentials: "omit" });
  if (!res.ok) throw new Error("fetch packs failed");
  return res.json();
}

export async function fetchQuestions(slug: string): Promise<Question[]> {
  const res = await fetch(`${API}/api/questions?slug=${encodeURIComponent(slug)}`);
  if (!res.ok) throw new Error("fetch questions failed");
  return res.json();
}
