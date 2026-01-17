// apps/frontend/src/App.tsx
import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";

export default function App() {
  return (
    <div style={{ padding: 20 }}>
      <h1>Router mounted</h1>

      <Routes>
        <Route path="/" element={<div>Home OK</div>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
