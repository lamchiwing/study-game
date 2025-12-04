import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

// === 頁面 ===
import PacksPage from "./pages/PacksPage";
import QuizPage from "./pages/QuizPage";
import UploadPage from "./pages/UploadPage";
import ParentReportPage from "./pages/ParentReportPage";
import PricingPage from "./pages/PricingPage";
import CheckoutPage from "./pages/CheckoutPage";
import CheckoutSuccessPage from "./pages/CheckoutSuccessPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route index element={<Navigate to="/packs" replace />} />
        <Route path="/packs" element={<PacksPage />} />
        <Route path="/quiz" element={<QuizPage />} />
        <Route path="/upload" element={<UploadPage />} />

        {/* 方案與收費頁（Finish 後會 navigate 到這裡） */}
        <Route path="/pricing" element={<PricingPage />} />

        {/* 結帳流程 */}
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/checkout/success" element={<CheckoutSuccessPage />} />

        {/* 家長報告頁 */}
        <Route path="/parent/report/:id" element={<ParentReportPage />} />

        {/* 其他未匹配路由一律導回 /packs */}
        <Route path="*" element={<Navigate to="/packs" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

