// apps/backend/server.js
const express = require("express");
const cors = require("cors");

const app = express();

// apps/backend/server.js
const express = require("express");
const cors = require("cors");
const { spawn } = require("child_process");   // ← 新增：用來觸發 Python 批次
const AWS = require("aws-sdk");               // ← 新增：R2 預簽名

const app = express();
app.use(express.json());

// CORS
const allowed = (process.env.FRONTEND_ORIGIN || "*").split(";");
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
    // 你也可以驗證管理員，例如: if (req.headers["x-admin-token"] !== process.env.ADMIN_TOKEN) return res.sendStatus(401)
    const filename = (req.query.filename || "upload.pdf").toString();
    const key = `incoming/${Date.now()}_${filename}`;
    const params = {
      Bucket: R2_BUCKET,
      Key: key,
      ContentType: "application/pdf",
      CacheControl: "public, max-age=31536000, immutable",
      Expires: 600, // seconds
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
    // 可帶 ?pdf_dir=...&dry_run=true
    const pdfDir = (req.query.pdf_dir || "pdfs").toString();
    const dryRun = ((req.query.dry_run || "true").toString().toLowerCase() === "true");

    // apps/etl/app/main.py（等下你會新增這個目錄與檔案）
    const path = require("path");
    const etlScript = path.resolve(process.cwd(), "apps/etl/app/main.py");

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

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`[backend] listening on :${port}`));

app.use(express.json());

const allowed = (process.env.FRONTEND_ORIGIN || "*").split(",");
app.use(cors({ origin: allowed, credentials: true }));

app.get("/healthz", (_req, res) => res.send("ok"));
app.get("/api/ping", (_req, res) => res.json({ pong: true, time: new Date().toISOString() }));
app.post("/api/score", (req, res) => res.json({ ok: true, received: req.body || {} }));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`[backend] listening on :${port}`));
