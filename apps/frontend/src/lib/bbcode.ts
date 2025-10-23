// apps/frontend/src/lib/bbcode.ts
import React from "react";

/** 基本 HTML escape（先做，再進行 BBCode 轉換，避免 XSS） */
function escapeHtml(src: string): string {
  return String(src ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * 將含 BBCode 的文字轉為安全 HTML 片段。
 * 支援：
 *  - [c=name]...[/c]  轉為 <span style="color:var(--c-name)">...</span>
 *  - [b] [i] [u]
 *  - [br] 與換行 \n → <br>
 */
export function preprocessBBCodeToHTML(src: string): string {
  // 先 escape，確保任意 HTML 不會被直接注入
  let s = escapeHtml(src);

  // 基本 BBCode（用在已 escape 的文字上）
  s = s
    // 顏色 span（限制顏色 key 僅由 a-z0-9_- 構成，避免奇怪字元）
    .replace(/\[c=([a-z0-9_-]+)\]/gi, (_m, c) => `<span style="color:var(--c-${c})">`)
    .replace(/\[\/c\]/gi, "</span>")
    // 粗體/斜體/底線
    .replace(/\[b\]/gi, "<strong>")
    .replace(/\[\/b\]/gi, "</strong>")
    .replace(/\[i\]/gi, "<em>")
    .replace(/\[\/i\]/gi, "</em>")
    .replace(/\[u\]/gi, "<u>")
    .replace(/\[\/u\]/gi, "</u>")
    // 換行
    .replace(/\[br\]/gi, "<br>");

  // 一般換行也轉 <br>
  s = s.replace(/\r?\n/g, "<br>");

  return s;
}

/** 移除 BBCode（輸出純文字；同時保留一般字元的 escape 一致性） */
export function stripBBCode(src: string): string {
  // 這裡不需要保留 HTML，所以只要移除 BBCode，再把 &<> 等做 escape（防止顯示/日後拼接出問題）
  const withoutTags = String(src ?? "")
    .replace(/\[c=([a-z0-9_-]+)\]/gi, "")
    .replace(/\[\/c\]/gi, "")
    .replace(/\[(?:b|i|u)\]/gi, "")
    .replace(/\[\/(?:b|i|u)\]/gi, "")
    .replace(/\[br\]/gi, "")
    .replace(/\r?\n/g, " ");
  return escapeHtml(withoutTags);
}

/** 在 React 中安全渲染 BBCode 內容為 <span>…</span> */
export function renderContent(src: string): React.ReactNode {
  const html = preprocessBBCodeToHTML(src || "");
  // 用 createElement 避免在 .ts 檔寫 JSX
  return React.createElement("span", { dangerouslySetInnerHTML: { __html: html } });
}
