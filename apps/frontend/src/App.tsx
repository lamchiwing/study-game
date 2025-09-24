// apps/frontend/src/App.tsx
import React, { useEffect, useMemo, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, Link, useSearchParams } from "react-router-dom";
import Packs from "./pages/Packs";
import Quiz from "./pages/Quiz";

// 同時支援 VITE_API_BASE 與 VITE_API_BASE_URL；沒設就同源
const API_BASE =
  (import.meta.env as any).VITE_API_BASE ||
  (import.meta.env as any).VITE_API_BASE_URL ||
  "";

function Home() {
  const [pong, setPong] = useState<string>("");
  const api = useMemo(() => {
    const base = (API_BASE || "").replace(/\/+$/, "");
    return {
      url: (p: string) => `${base}${p}`,
      label: base || "(same-origin)",
    };
  }, []);

  useEffect(() => {
    fetch(api.url("/api/ping"))
      .then((r) => r.json())
      .then((d) => setPong(JSON.stringify(d)))
      .catch((e) => setPong(`error: ${e}`));
  }, [api]);

  async function postRandomScore() {
    try {
      const res = await fetch(api.url("/api/score"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score: Math.floor(Math.random() * 1000) }),
      });
      alert(await res.text());
    } catch (e: any) {
      alert(`POST /api/score failed: ${e?.message || e}`);
    }
  }

  return (
    <div style={{ padding: 24, textAlign: "center" }}>
      <h1>Web Game Starter</h1>
      <p>API: <code>{api.label}</code></p>
      <p>Ping → {pong || "loading..."}</p>
      <button onClick={postRandomScore} style={{ padding: "8px 14px", borderRadius: 12, border: "1px solid #ccc" }}>
        POST 隨機分數 → /api/score
      </button>

      <div style={{ marginTop: 16, display: "flex", gap: 12, justifyContent: "center" }}>
        <Link to="/packs">前往題包列表（/packs）</Link>
        <Link to="/quiz?slug=chinese/grade1/colors-demo">直接開始測驗（/quiz?slug=...）</Link>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        {/* 題包列表頁 */}
        <Route path="/packs" element={<Packs />} />
        {/* 測驗頁（讀取 querystring 的 slug） */}
        <Route path="/quiz" element={<Quiz />} />
        {/* 未匹配到路徑時，導回 /packs 或 / */}
        <Route path="*" element={<Navigate to="/packs" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
