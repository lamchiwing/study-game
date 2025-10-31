// apps/frontend/src/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import PacksPage from "./pages/PacksPage";
import QuizPage from "./pages/QuizPage";
import PricingPage from "./pages/PricingPage";
import CheckoutPage from "./pages/CheckoutPage";
import Layout from "./components/Layout";

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          {/* 預設導向 packs */}
          <Route path="/" element={<Navigate to="/packs" replace />} />
          <Route path="/packs" element={<PacksPage />} />
          <Route path="/quiz" element={<QuizPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/report" element={<ParentReportPage />} />
          <Route path="/upload" element={<UploadPage />} /> {/* ✅ 新增這行 */}


          {/* 兜底：未知路徑導回 packs */}
          <Route path="*" element={<Navigate to="/packs" replace />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
