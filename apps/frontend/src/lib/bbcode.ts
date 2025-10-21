// apps/frontend/src/lib/bbcode.ts
import React from "react";

/** 把 [c=name]文字[/c] 轉成帶顏色的 span；可自行擴充更多 BBCode */
export function renderContent(s?: string): React.ReactNode {
  const t = String(s ?? "");
  const html = t
    .replace(/\[c=([a-z0-9_-]+)\]/gi, (_m, c) => `<span style="color:var(--c-${c})">`)
    .replace(/\[\/c\]/gi, "</span>");
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

/** 去掉 BBCode（用在 <option> 或 email 純文字） */
export function stripBBCode(s?: string): string {
  return String(s ?? "").replace(/\[c=[^\]]+\]/gi, "").replace(/\[\/c\]/gi, "");
}
