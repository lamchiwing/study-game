import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

// 規整 API Base：去掉引號、尾斜線、以及不小心貼成 https://x/https://x 的情況
function normBase(s?: string) {
  let b = (s ?? "").trim();
  b = b.replace(/^['"]|['"]$/g, "");
  b = b.replace(/\/+$/, "");
  const m = b.match(/^(https?:\/\/[^/]+)(?:\/https?:\/\/[^/]+)?$/);
  return m ? m[1] : b;
}
const dedupe = (arr: string[]) => Array.from(new Set(arr.filter(Boolean)));

function slugify(s: string) {
  return s
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();
}

export default function UploadPage() {
  const [subject, setSubject] = useState("chinese"); // chinese / math / english...
  const [grade, setGrade] = useState("grade1");      // grade1 ~ grade5
  const [packName, setPackName] = useState("mixed-colored-demo");
  const [file, setFile] = useState<File | null>(null);

  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadedSlug, setUploadedSlug] = useState<string | null>(null);

  const slug = useMemo(() => {
    return `${subject}/${grade}/${slugify(packName)}`;
  }, [subject, grade, packName]);

  async function doUpload() {
    setStatus("Uploading…");
    setError(null);
    setUploadedSlug(null);

    if (!file) {
      setStatus(null);
      setError("請先選擇 CSV 檔。");
      return;
    }

    const base = normBase(import.meta.env.VITE_API_BASE as string | undefined);
    const direct = "https://study-game-back.onrender.com";
    const urlCandidates = dedupe([
      base && `${base}/upload?slug=${encodeURIComponent(slug)}`,
      base && `${base}/api/upload?slug=${encodeURIComponent(slug)}`,
      `${direct}/upload?slug=${encodeURIComponent(slug)}`,
      `${direct}/api/upload?slug=${encodeURIComponent(slug)}`,
    ]);

    // 用 FormData 上傳 multipart
    const fd = new FormData();
    fd.append("file", file, file.name);

    let lastErr: any = null;
    for (const url of urlCandidates) {
      try {
        const res = await fetch(url, { method: "POST", body: fd });
        if (!res.ok) {
          lastErr = new Error(`HTTP ${res.status} @ ${url}`);
          continue;
        }
        const data = await res.json().catch(() => ({}));
        setStatus("上載成功！");
        setUploadedSlug(slug);
        return;
      } catch (e) {
        lastErr = e;
        continue;
      }
    }
    setStatus(null);
    setError(`上載失敗：${String(lastErr)}`);
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
            {/* 需要可自行擴充 */}
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
          <button onClick={doUpload} className="rounded bg-black px-3 py-2 text-white">
            上載
          </button>
          <a
            className="rounded border px-3 py-2"
            href="sandbox:/mnt/data/mixed-colored-demo.csv"
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
                直接作答：{" "}
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
        小提示：在 iPad 上，點「選擇檔案」可以從「檔案」App 或 iCloud Drive 選 CSV。
      </div>
    </div>
  );
}
