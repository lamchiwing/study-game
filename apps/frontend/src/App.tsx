import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import PacksPage from "./pages/PacksPage";
import QuizPage from "./pages/QuizPage";
import UploadPage from "./pages/UploadPage";
import ParentReportPage from "./pages/ParentReportPage";


export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route index element={<Navigate to="/packs" replace />} />
        <Route path="/packs" element={<PacksPage />} />
        <Route path="/quiz" element={<QuizPage />} />
        <Route path="/upload" element={<UploadPage />} />

        {/* ⬇️ 新增的家長報告頁（一定要放在 * 之前） */}
        <Route path="/parent/report/:id" element={<ParentReportPage />} />

        {/* 其他未匹配路由一律導回 /packs */}
        <Route path="*" element={<Navigate to="/packs" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
