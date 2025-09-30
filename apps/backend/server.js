// apps/backend/server.js  (ESM)
import express from "express";
import cors from "cors";

const app = express();

// ===== CORS：白名單 =====
const allowlist = [
  "https://study-game-front.onrender.com",
  "http://localhost:5173",
  process.env.FRONTEND_ORIGIN, // 綁自家網域時加在 Render Env
].filter(Boolean);

const corsOptions = {
  origin(origin, callback) {
    // 無 origin（健康檢查、同機請求）放行
    if (!origin) return callback(null, true);
    if (allowlist.includes(origin)) return callback(null, true);
    return callback(new Error(`Not allowed by CORS: ${origin}`));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  credentials: false, // ← 若前端不帶 cookie，建議關掉（更簡單）
  maxAge: 86400,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions)); // 預檢

app.use(express.json());

// ===== 健康檢查（避免根路徑 404）=====
app.get("/", (_req, res) => {
  res.type("text").send("study-game-back OK");
});

// ===== 資料路由 =====
// 同時支援 /packs 與 /api/packs，避免前端/文件不一致造成 404
app.get(["/packs", "/api/packs"], async (_req, res) => {
  try {
    // TODO: 這裡接 DB / S3 / 檔案
    const packs = [
      { slug: "chinese/grade1/colors-demo", title: "Colors Demo", subject: "Chinese", grade: "Grade 1" },
    ];
    // 沒資料也回 200 + []，UX 較好
    res.json(packs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "failed to load packs" });
  }
});

app.get(["/quiz", "/api/quiz"], async (req, res) => {
  try {
    const slug = String(req.query.slug || "");
    if (!slug) return res.status(400).json({ error: "missing slug" });

    if (slug === "chinese/grade1/colors-demo") {
      return res.json({
        questions: [
          { id: "1", question: "紅色的英文是？", choiceA: "Red", choiceB: "Blue", choiceC: "Green", choiceD: "Yellow", answer: "A", explain: "Red 就是紅色" },
        ],
      });
    }

    // 找不到該 slug：建議回 200 + 空清單
    res.json({ questions: [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "failed to load quiz" });
  }
});

// ===== 全域錯誤處理（含 CORS 錯誤友善回應）=====
app.use((err, _req, res, _next) => {
  if (String(err?.message || "").startsWith("Not allowed by CORS")) {
    return res.status(403).json({ error: err.message });
  }
  console.error("[UNHANDLED]", err);
  res.status(500).json({ error: "internal error" });
});

// ===== 啟動 =====
app.listen(process.env.PORT || 8000, () => {
  console.log("API ready");
});
