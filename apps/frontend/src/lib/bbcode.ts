// apps/frontend/src/lib/bbcode.ts
import React from "react";

export function preprocessBBCodeToHTML(src: string): string {
  const s = String(src ?? "");
  const html = s
    // [c=ai]文字[/c] → <span style="color:var(--c-ai)">文字</span>
    .replace(/\[c=([a-z0-9_-]+)\]/gi, (_m, c) => `<span style="color:var(--c-${c})">`)
    .replace(/\[\/c\]/gi, "</span>")
    // (可選) 簡單處理粗斜底線
    .replace(/\[b\]/gi, "<strong>").replace(/\[\/b\]/gi, "</strong>")
    .replace(/\[i\]/gi, "<em>").replace(/\[\/i\]/gi, "</em>")
    .replace(/\[u\]/gi, "<u>").replace(/\[\/u\]/gi, "</u>");
  return html;
}

export function stripBBCode(src: string): string {
  const s = String(src ?? "");
  return s
    .replace(/\[c=([a-z0-9_-]+)\]/gi, "")
    .replace(/\[\/c\]/gi, "")
    .replace(/\[(?:b|i|u)\]/gi, "")
    .replace(/\[\/(?:b|i|u)\]/gi, "");
}

export function renderContent(src: string): React.ReactElement {
  const html = preprocessBBCodeToHTML(src || "");
  // 用 createElement 避免在 .ts 檔寫 JSX
  return React.createElement("span", { dangerouslySetInnerHTML: { __html: html } });
}
