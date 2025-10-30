import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

/* =========================================================
   Utility：清理 API base URL
========================================================= */
function normBase(s?: string) {
  let b = (s ?? "").trim();
  b = b.replace(/^['"]|['"]$/g, "");
  b = b.replace(/\/+$/, "");
  const m = b.match(/^(https?:\/\/[^/]+)(?:\/https?:\/\/[^/]+)?$/);
  return m ? m[1] : b;
}

function slugify(s: string) {
  return s
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();
}

/* =========================================================
   Upload Page Component
========================================================= */
export default function UploadPage() {
  const [subject, setSubject] = useState("chinese");
  const [grade, setGrade] = useState("grade1");
  const [packName, setPackName] = useState("colors-demo");
  const [file, setFile] = useState<File | null>(null);

  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadedSlug, setUploadedSlug] = useState<string | null>(null);

  const slug = useMemo(() => `${subject}/${grade}/${slugify(packName)}`, [subject, grade, packName]);

  // === 設定後端 API 基址 ===
  const API_BASE =
    normBase(import.meta.env.VITE_API_BASE as string | undefined) ||
    "https://study-game-back.onrender.com";

  async function doUpload() {
    setStatus("正在上載...");
    setError(null);
    setUploadedSlug(null);

    if (!file) {
      setStatus(null);
      setError("請先選擇 CSV 檔案。");
      return;
    }

    const url = `${API_BASE}/api/upload?slug=${encodeURIComponent(slug)}`;
    const fd = new FormData();
    fd.append("file", file, file.name);

    try {
      const res = await fetch(url, { method: "POST", body: fd });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`上載失敗（HTTP ${res.status}）: ${text}`);
      }
      const data = await res.json();
      setStatus("✅ 上載成功！");
      setUploadedSlug(slug);
    } catch (e: any) {
      setStatus(null);
      setError(`上載失敗：${e?.message || e}`);
    }
  }

  return (
    <div className="p-6 max-w-xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">上載題包 CSV</h1>
        <Link to="/packs" className="text-sm underline">
          ← 回題包列表
        </Link>
      </div>

      <div className="grid gap-3">
        <label className="grid gap-1">
          <span className="text-sm text-gray-600">科目 Subject</span>
          <select
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="rounded border p-2"
          >
            <option value="chinese">Chinese</option>
            <option value="english">English</option>
            <option value="math">Math</option>
          </select>
        </label>

        <label className="grid gap-1">
          <span className="text-sm text-gray-600">年級 Grade</span>
          <select
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            className="rounded border p-2"
          >
            <option value="grade1">Grade 1</option>
            <option value="grade2">Grade 2</option>
            <option value="grade3">Grade 3</option>
            <option value="grade4">Grade 4</option>
            <option value="grade5">Grade 5</option>
          </select>
        </label>

        <label className="grid gap-1">
          <span className="text-sm text-gray-600">題包名稱（會自動轉為 slug）</span>
          <input
            value={packName}
            onChange={(e) => setPackName(e.target.value)}
            placeholder="e.g. colors-demo"
            className="rounded border p-2"
          />
        </label>

        <label className="grid gap-1">
          <span className="text-sm text-gray-600">選擇 CSV 檔案</span>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>

        <div className="text-sm text-gray-600">
          生成 slug：<code className="text-black">{slug}</code>
        </div>

        <div className="flex gap-2">
          <button
            onClick={doUpload}
            className="rounded bg-black px-3 py-2 text-white"
          >
            上載
          </button>

          <a
            className="rounded border px-3 py-2"
            href="/demo/mixed-colored-demo.csv"
            target="_blank"
            rel="noreferrer"
          >
            下載示例 CSV
          </a>
        </div>

        {status && <div className="text-emerald-700">{status}</div>}
        {error && <div className="text-red-600">{error}</div>}

        {uploadedSlug && (
          <div className="rounded border p-3">
            <div className="mb-2">完成！你可以立即前往：</div>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                題包列表：<Link className="underline" to="/packs">/packs</Link>
              </li>
              <li>
                直接作答：
                <Link
                  className="underline"
                  to={`/quiz?slug=${encodeURIComponent(uploadedSlug)}`}
                >
                  /quiz?slug={uploadedSlug}
                </Link>
              </li>
            </ul>
          </div>
        )}
      </div>

      <div className="text-sm text-gray-500">
        小提示：在 iPad 上可從「檔案」App 或 iCloud Drive 選 CSV 上傳。
      </div>
    </div>
  );
}
