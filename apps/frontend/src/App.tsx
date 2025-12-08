// apps/frontend/src/App.tsx
import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import Navbar from "./components/Navbar";
import PacksPage from "./pages/PacksPage";
import QuizPage from "./pages/QuizPage";
import PricingPage from "./pages/PricingPage";
import CheckoutPage from "./pages/CheckoutPage";
import CheckoutSuccessPage from "./pages/CheckoutSuccessPage";
import LoginPage from "./pages/LoginPage";

const App: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* 全站頂部 */}
      <Navbar />

      {/* 主要內容 */}
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Routes>
          {/* default → /packs */}
          <Route path="/" element={<Navigate to="/packs" replace />} />

          {/* 題目列表 */}
          <Route path="/packs" element={<PacksPage />} />

          {/* 測驗頁（用 ?slug=...） */}
          <Route path="/quiz" element={<QuizPage />} />

          {/* 收費方案 */}
          <Route path="/pricing" element={<PricingPage />} />

          {/* Stripe 付款頁（backend create-checkout-session 之後 redirect） */}
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route
            path="/checkout/success"
            element={<CheckoutSuccessPage />}
          />

          {/* 家長登入（email + 驗證碼） */}
          <Route path="/login" element={<LoginPage />} />

          {/* fallback：未知 path → /packs */}
          <Route path="*" element={<Navigate to="/packs" replace />} />
        </Routes>
      </main>
    </div>
  );
};

export default App;
