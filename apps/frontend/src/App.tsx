import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import PacksPage from "./pages/PacksPage";
import QuizPage from "./pages/QuizPage";
import UploadPage from "./pages/UploadPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route index element={<Navigate to="/packs" replace />} />
        <Route path="/packs" element={<PacksPage />} />
        <Route path="/quiz" element={<QuizPage />} />
        <Route path="/upload" element={<UploadPage />} />
        <Route path="*" element={<Navigate to="/packs" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
