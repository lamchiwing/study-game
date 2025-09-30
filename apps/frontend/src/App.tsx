// src/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { PacksPage } from "./pages/PacksPage";
import { QuizPage } from "./pages/QuizPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* 首頁自動導向 /packs */}
        <Route index element={<Navigate to="/packs" replace />} />
        <Route path="/packs" element={<PacksPage />} />
        <Route path="/quiz" element={<QuizPage />} />
        {/* SPA fallback：未知路徑 → /packs */}
        <Route path="*" element={<Navigate to="/packs" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
