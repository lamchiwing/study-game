// apps/backend/server.js
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());

const allowed = (process.env.FRONTEND_ORIGIN || "*").split(",");
app.use(cors({ origin: allowed, credentials: true }));

app.get("/healthz", (_req, res) => res.send("ok"));
app.get("/api/ping", (_req, res) => res.json({ pong: true, time: new Date().toISOString() }));

// 1) 載入題庫（純文字）
const CURR_PATH = path.join(__dirname, "content", "curriculum.json");
let QUESTIONS = [];
try {
  QUESTIONS = JSON.parse(fs.readFileSync(CURR_PATH, "utf8"));
  console.log("[backend] curriculum loaded:", QUESTIONS.length);
} catch (e) {
  console.warn("[backend] curriculum not found:", CURR_PATH);
}

// 2) 內存記分板（按 childId 記總分；伺服器重啟會清零）
const SCOREBOARD = new Map();

// 工具：字串正規化（填充題比較用）
function norm(s) {
  if (typeof s !== "string") return "";
  return s
    .toLowerCase()
    .normalize("NFKC")          // 全半形統一
    .replace(/\s+/g, " ")       // 空白折疊
    .replace(/[,，]/g, "")      // 去千分位
    .trim();
}
function parseNumberLike(s) {
  const m = norm(s).match(/^-?\d+(\.\d+)?$/);
  return m ? parseFloat(m[0]) : null;
}

// 3) 取題（支援 subject/grade/topic/lo）
app.get("/api/content", (req, res) => {
  const { subject, grade, topic, lo, limit = 10 } = req.query;
  let pool = QUESTIONS;
  if (subject) pool = pool.filter(q => q.subject === subject);
  if (grade)   pool = pool.filter(q => Number(q.grade) === Number(grade));
  if (topic)   pool = pool.filter(q => q.topic === topic);
  if (lo)      pool = pool.filter(q => q.lo === lo);
  // 洗牌取樣
  pool = [...pool].sort(() => Math.random() - 0.5).slice(0, Number(limit));
  // 不回傳答案/解析
  const items = pool.map(({ answer, explain, ...rest }) => rest);
  res.json({ items, count: items.length });
});

// 4) 批改與計分
//   body: { childId, qid, picked?, text? }
//   - mcq：用 picked = 'A'/'B'/'C'/'D'
//   - tf： picked = 'T'/'F' 或 'true'/'false'
//   - fitb：text = 使用者填寫（可用 | 分隔多個正解）
app.post("/api/submit", (req, res) => {
  const { childId = "anon", qid, picked, text } = req.body || {};
  const q = QUESTIONS.find(x => x.id === qid);
  if (!q) return res.status(400).json({ ok:false, reason:"unknown qid" });

  let correct = false;
  const ans = (q.answer || "").trim();

  if (q.type === "mcq") {
    correct = (String(picked || "").toUpperCase().slice(0,1) === ans.toUpperCase());
  } else if (q.type === "tf") {
    const p = String(picked || "").toLowerCase();
    const pv = (p === "t" || p === "true" || p === "1" || p === "是" || p === "對");
    const av = (ans.toUpperCase().startsWith("T"));
    correct = (pv === av);
  } else if (q.type === "fitb") {
    const user = norm(String(text || ""));
    // 支援多個正解，用 | 分隔；同時嘗試數值比較
    const answers = ans.split("|").map(a => norm(a));
    // 文字匹配
    correct = answers.includes(user);
    // 數值等價（如 "3.5" 與 "3.50"）
    if (!correct) {
      const uv = parseNumberLike(user);
      if (uv !== null) {
        for (const a of answers) {
          const av = parseNumberLike(a);
          if (av !== null && Math.abs(uv - av) < 1e-9) { correct = true; break; }
        }
      }
    }
  } else {
    return res.status(400).json({ ok:false, reason:`unsupported type: ${q.type}` });
  }

  const delta = correct ? 1 : 0; // 答對 +1 分
  const prev = SCOREBOARD.get(childId) || 0;
  const total = prev + delta;
  SCOREBOARD.set(childId, total);

  res.json({
    ok: true,
    correct,
    delta,        // 本題得分
    total,        // 累計總分
    explain: q.explain || "",
    type: q.type
  });
});

// 5) 查分 / 重置
app.get("/api/scoreboard/:childId", (req, res) => {
  const total = SCOREBOARD.get(req.params.childId) || 0;
  res.json({ ok:true, childId: req.params.childId, total });
});
app.post("/api/scoreboard/reset", (req, res) => {
  const { childId = "anon" } = req.body || {};
  SCOREBOARD.set(childId, 0);
  res.json({ ok:true, childId, total: 0 });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`[backend] listening on :${port}`));
