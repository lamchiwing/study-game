// apps/frontend/src/App.tsx
import { Routes, Route, Navigate } from "react-router-dom";
import PacksPage from "./pages/PacksPage";
import QuizPage from "./pages/QuizPage";
import PricingPage from "./pages/PricingPage";

function App() {
  return (
    <Routes>
      {/* 預設導向 packs（可按你的需求修改） */}
      <Route path="/" element={<Navigate to="/packs" replace />} />

      <Route path="/packs" element={<PacksPage />} />
      <Route path="/quiz" element={<QuizPage />} />
      <Route path="/pricing" element={<PricingPage />} />

      {/* 兜底：未知路徑導回 packs */}
      <Route path="*" element={<Navigate to="/packs" replace />} />
    </Routes>
  );
}

export default App;
