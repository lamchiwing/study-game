// apps/frontend/src/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import PacksPage from "./pages/PacksPage";
import QuizPage from "./pages/QuizPage";
import PricingPage from "./pages/PricingPage";
import CheckoutPage from "./pages/CheckoutPage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* 預設導向 packs */}
        <Route path="/" element={<Navigate to="/packs" replace />} />

        <Route path="/packs" element={<PacksPage />} />
        <Route path="/quiz" element={<QuizPage />} />
        <Route path="/pricing" element={<PricingPage />} />

        {/* 兜底：未知路徑導回 packs */}
        <Route path="*" element={<Navigate to="/packs" replace />} />
        <Route path="/checkout" element={<CheckoutPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
