// apps/backend/server.js
const express = require("express");
const cors = require("cors");

const app = express();
app.use(express.json());

const allowed = (process.env.FRONTEND_ORIGIN || "*").split(",");
app.use(cors({ origin: allowed, credentials: true }));

app.get("/healthz", (_req, res) => res.send("ok"));
app.get("/api/ping", (_req, res) => res.json({ pong: true, time: new Date().toISOString() }));
app.post("/api/score", (req, res) => res.json({ ok: true, received: req.body || {} }));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`[backend] listening on :${port}`));
