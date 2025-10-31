import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

// === 頁面 ===
import PacksPage from "./pages/PacksPage";
import QuizPage from "./pages/QuizPage";
import UploadPage from "./pages/UploadPage";
import ParentReportPage from "./pages/ParentReportPage";
import PricingPage from "./pages/PricingPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* 預設導向 */}
        <Route path="/" element={<Navigate to="/packs" replace />} />

        {/* 題包清單 */}
        <Route path="/packs" element={<PacksPage />} />

        {/* 測驗頁 */}
        <Route path="/quiz" element={<QuizPage />} />

        {/* 家長報告頁 */}
        <Route path="/report" element={<ParentReportPage />} />

        {/* 題庫上載頁（老師專用） */}
        <Route path="/upload" element={<UploadPage />} />

        {/* 價格與方案頁 */}
        <Route path="/pricing" element={<PricingPage />} />

        {/* 無效路徑 → 回 packs */}
        <Route path="*" element={<Navigate to="/packs" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
