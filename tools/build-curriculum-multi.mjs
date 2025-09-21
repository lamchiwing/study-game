// tools/build-curriculum-multi.mjs
// 將 content/questions/*.csv 合併成 apps/backend/content/curriculum.json（純文字題庫）
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';

const QDIR = 'content/questions';
const OUT = 'apps/backend/content/curriculum.json';
fs.mkdirSync('apps/backend/content', { recursive: true });

const files = fs.readdirSync(QDIR).filter(f => f.endsWith('.csv'));
const all = [];

for (const f of files) {
  const csv = fs.readFileSync(path.join(QDIR, f), 'utf8');
  const rows = parse(csv, { columns: true, skip_empty_lines: true });
  for (const r of rows) {
    all.push({
      id: r.id,
      type: (r.type || 'mcq').toLowerCase(), // mcq / tf / fitb
      subject: r.subject,
      grade: Number(r.grade),
      topic: r.topic,
      lo: r.lo,
      diff: Number(r.diff || 1),
      question: r.question,
      choiceA: r.choiceA || "",
      choiceB: r.choiceB || "",
      choiceC: r.choiceC || "",
      choiceD: r.choiceD || "",
      answer: (r.answer || "").trim(),
      explain: r.explain || ""
    });
  }
}

fs.writeFileSync(OUT, JSON.stringify(all, null, 2));
console.log(`✅ curriculum.json generated: ${all.length} items -> ${OUT}`);
