express from 'express';
import cors from 'cors';

const app = express();
app.use(express.json());

const allowed = [process.env.FRONTEND_ORIGIN ?? '*'];
app.use(
cors({
origin: allowed,
credentials: true,
})
);

app.get('/healthz', (_req, res) => res.send('ok'));

app.get('/api/ping', (_req, res) => {
res.json({ pong: true, time: new Date().toISOString() });
});

// 示例：提交分數
app.post('/api/score', (req, res) => {
// TODO: 寫入資料庫（Postgres/Redis）
res.json({ ok: true, received: req.body ?? {} });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`[backend] listening on :${port}`));
