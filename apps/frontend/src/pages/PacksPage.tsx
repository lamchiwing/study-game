// 新增一個小工具
async function fetchFirstOk<T = any>(paths: string[]): Promise<T> {
  for (const url of paths) {
    const r = await fetch(url);
    if (r.ok) return r.json();
    if (r.status === 404) continue; // 試下一個候選
    throw new Error(`HTTP ${r.status} @ ${url}`);
  }
  throw new Error(`All candidates 404: \n${paths.join("\n")}`);
}

// PacksPage.tsx 裡 useEffect 改成：
useEffect(() => {
  const BASE = import.meta.env.VITE_API_BASE?.replace(/\/$/, "") || "";
  const candidates = [
    `${BASE}/packs`,
    `${BASE}/api/packs`,
    // （保險）如果 .env 沒設好，直打已知後端
    `https://study-game-back.onrender.com/packs`,
    `https://study-game-back.onrender.com/api/packs`,
  ];

  fetchFirstOk(candidates)
    .then((data) => {
      const list = Array.isArray(data) ? data : data?.packs ?? [];
      setPacks(list);
    })
    .catch((e) => setError(String(e)))
    .finally(() => setLoading(false));
}, []);
