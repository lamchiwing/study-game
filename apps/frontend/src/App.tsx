import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Packs from "./pages/Packs";
import Quiz from "./pages/Quiz";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
       <Route path="/" element={<Navigate to="/packs" replace />} />
       <Route path="/packs" element={<Packs />} />
       <Route path="/quiz" element={<Quiz />} />
       <Route path="*" element={<Navigate to="/packs" replace />} />  
      </Routes>

    </BrowserRouter>
  );
}
