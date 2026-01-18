import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showErrorOnScreen(title: string, err: any) {
  const root = document.getElementById("root");
  if (!root) return;

  const msg =
    (err && (err.message || err.toString())) ||
    (typeof err === "string" ? err : "Unknown error");

  const stack = err && err.stack ? String(err.stack) : "";

  root.innerHTML = `
    <div style="padding:16px;font-family:ui-monospace, Menlo, Consolas, monospace;">
      <div style="color:#b00020;font-weight:700;margin-bottom:8px;">
        ${escapeHtml(title)}
      </div>
      <pre style="white-space:pre-wrap;color:#b00020;margin:0;">
${escapeHtml(msg)}
      </pre>
      <pre style="white-space:pre-wrap;color:#b00020;opacity:.85;margin-top:12px;">
${escapeHtml(stack)}
      </pre>
    </div>
  `;
}

// 捕捉同步 JS 錯誤
window.addEventListener("error", (e) => {
  showErrorOnScreen("Window error", (e as any).error || (e as any).message || e);
});

// 捕捉 Promise rejection（fetch / await 最常見）
window.addEventListener("unhandledrejection", (e) => {
  showErrorOnScreen("Unhandled promise rejection", (e as any).reason || e);
});

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: any }
> {
  constructor(props: any) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { error };
  }
  componentDidCatch(error: any) {
    showErrorOnScreen("React render error", error);
  }
  render() {
    if (this.state.error) return null;
    return this.props.children;
  }
}

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
