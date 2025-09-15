// apps/backend/server.js
const express = require("express");
const cors = require("cors");
const { spawn } = require("child_process");  // 觸發 Python 批次
const AWS = require("aws-sdk");              // 產生 R2 預簽名 URL

const app = express();
app.use(express.json());

// CORS
const allowed = (process.env.FRONTEND_ORIGIN || "*").split(/[;,]/); // 支援逗號或分號分隔
app.use(cors({ origin: allowed, credentials: true }));

// --- 健康檢查/示例 ---
app.get("/healthz", (_req, res) => res.send("ok"));
app.get("/api/ping", (_req, res) => res.json({ pong: true, time: new Date().toISOString() }));

// ====== ① R2 預簽名上傳 ======
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ENDPOINT = R2_ACCOUNT_ID ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : undefined;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET || "study-game";

const s3 = new AWS.S3({
  endpoint: R2_ENDPOINT,
  accessKeyId: R2_ACCESS_KEY_ID,
  secretAccessKey: R2_SECRET_ACCESS_KEY,
  signatureVersion: "v4",
  s3ForcePathStyle: true,
});

app.post("/r2/presign-upload", async (req, res) => {
  try {
    const filename = (req.query.filename || "upload.pdf").toString();
    const key = `incoming/${Date.now()}_${filename}`;
    const params = {
      Bucket: R2_BUCKET,
      Key: key,
      ContentType: "application/pdf",
      CacheControl: "public, max-age=31536000, immutable",
      Expires: 600, // 秒
    };
    const url = await s3.getSignedUrlPromise("putObject", params);
    res.json({ uploadUrl: url, key });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || "presign failed" });
  }
});

// ====== ② 觸發 Python 批次（PDF→CSV→上傳 R2） ======
app.post("/admin/ingest/run", (req, res) => {
  try {
    const pdfDir = (req.query.pdf_dir || "pdfs").toString();
    const dryRun = ((req.query.dry_run || "true").toString().toLowerCase() === "true");

    const path = require("path");
    const etlScript = path.resolve(process.cwd(), "apps/etl/app/main.py"); // 你的 Python 腳本路徑

    const env = { ...process.env, INPUT_DIR: pdfDir, DRY_RUN: dryRun ? "true" : "false" };
    const py = spawn("python", [etlScript], { env });

    let out = "", err = "";
    py.stdout.on("data", (d) => (out += d.toString()));
    py.stderr.on("data", (d) => (err += d.toString()));
    py.on("close", (code) => {
      res.json({ code, stdout: out.slice(-8000), stderr: err.slice(-8000) });
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || "ingest failed" });
  }
});

// ====== 舊有示例路由 ======
app.post("/api/score", (req, res) => {
  res.json({ ok: true, received: req.body ?? {} });
});

// 啟動一次就好（不要重複 listen）
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`[backend] listening on :${port}`));
