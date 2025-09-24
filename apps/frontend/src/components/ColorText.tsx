import React from "react";

type Chunk = { text: string; color?: string };
const NAMED: Record<string, string> = { r: "#e53935", g: "#43a047", b: "#1e88e5" };

function parse(input: string): Chunk[] {
  if (!input) return [{ text: "" }];
  const chunks: Chunk[] = [];
  let i = 0;
  while (i < input.length) {
    const open = input.indexOf("{", i);
    if (open === -1) { chunks.push({ text: input.slice(i) }); break; }
    if (open > i) chunks.push({ text: input.slice(i, open) });

    const closeTag = input.indexOf("}", open + 1);
    if (closeTag === -1) { chunks.push({ text: input.slice(open) }); break; }

    const tag = input.slice(open + 1, closeTag).trim(); // r/g/b 或 #RRGGBB
    const end = tag === "" ? -1 : input.indexOf("{/", closeTag + 1);
    if (end === -1) { chunks.push({ text: input.slice(open, closeTag + 1) }); i = closeTag + 1; continue; }

    const endClose = input.indexOf("}", end + 2);
    if (endClose === -1) { chunks.push({ text: input.slice(open) }); break; }

    const inner = input.slice(closeTag + 1, end);
    const color = NAMED[tag] || (tag.startsWith("#") ? tag : undefined);
    chunks.push({ text: inner, color });
    i = endClose + 1;
  }
  return chunks;
}

export default function ColorText({ text }: { text: string }) {
  const parts = parse(text);
  return (
    <>
      {parts.map((p, idx) =>
        p.color ? <span key={idx} style={{ color: p.color }}>{p.text}</span> : <span key={idx}>{p.text}</span>
      )}
    </>
  );
}
