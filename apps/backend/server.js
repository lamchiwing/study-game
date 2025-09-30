// apps/backend/server.js
import express from "express";
import cors from "cors";

const app = express();

// 允許的前端來源（按你現在部署 + 本機開發 + 未來自訂網域）
const allowlist = [
  "https://study-game-front.onrender.com",
  "http://localhost:5173",
  process.env.FRONTEND_ORIGIN,   // 之後綁自家網域時，在 Render 環境變數加這一項
].filter(Boolean);

const corsOptions = {
  origin(origin, callback) {
    // 無 origin（如健康檢查、同機請求）一律放行
    if (!origin) return callback(null, true);
    // 嚴格白名單
    if (allowlist.includes(origin)) return callback(null, true);
    // 如需允許某子網域，可用正則：
    // if (/^https:\/\/.+\.yourdomain\.com$/.test(origin)) return callback(null, true);

    return callback(new Error(`Not allowed by CORS: ${origin}`));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  credentials: true,          // 只有在「要帶 cookie/憑證」才設為 true
  maxAge: 86400,              // 預檢快取（秒）
};

// 全域啟用 CORS
app.use(cors(corsOptions));
// 確保預檢請求（OPTIONS）不會 404
app.options("*", cors(corsOptions));

app.use(express.json());

// 你的既有路由...
// app.get("/packs", ...);
// app.get("/quiz", ...);

app.listen(process.env.PORT || 8000, () => {
  console.log("API ready");
});
