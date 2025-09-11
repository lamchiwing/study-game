import { useEffect, useState } from 'react';

const API = import.meta.env.VITE_API_BASE_URL ?? '';

export default function App() {
const [pong, setPong] = useState<string>('');

useEffect(() => {
fetch(`${API}/api/ping`)
.then((r) => r.json())
.then((d) => setPong(JSON.stringify(d)))
.catch((e) => setPong(`error: ${e}`));
}, []);

return (
<div style={{
minHeight: '100vh',
display: 'flex',
alignItems: 'center',
justifyContent: 'center',
flexDirection: 'column',
fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Noto Sans'
}}>
<h1>Web Game Starter</h1>
<p>API: <code>{API || '(same-origin)'}</code></p>
<p>Ping → {pong || 'loading...'}</p>
<button
onClick={async () => {
const res = await fetch(`${API}/api/score`, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ score: Math.floor(Math.random() * 1000) })
});
alert(await res.text());
}}
>
POST /api/score
</button>
</div>
);
}
