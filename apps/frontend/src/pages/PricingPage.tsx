import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMemo, useState } from "react";

const SUBJECTS = [
  { value: "chinese", label: "中文" },
  { value: "math", label: "數學" },
  { value: "general", label: "常識" },
];

const GRADES = [
  { value: "grade1", label: "小一" },
  { value: "grade2", label: "小二" },
  { value: "grade3", label: "小三" },
  { value: "grade4", label: "小四" },
  { value: "grade5", label: "小五" },
  { value: "grade6", label: "小六" },
];

export default function PricingPage() {
  const navigate = useNavigate();
  const [sp] = useSearchParams();

  // 如果係由 Quiz 跳過嚟，URL 會帶住呢啲參數
  const slugFromQuery = sp.get("slug") || "";
  const subjectFromQuery = sp.get("subject") || "chinese";
  const gradeFromQuery = sp.get("grade") || "grade1";

  // Starter 用戶選擇（預設：由 URL 帶入，否則用中文＋小一）
  const [starterSubject, setStarterSubject] = useState(subjectFromQuery);
  const [starterGrade, setStarterGrade] = useState(gradeFromQuery);

  // 產生 checkout 連結（Starter）
  const starterHref = useMemo(() => {
    const qs = new URLSearchParams({
      plan: "starter",
      subject: starterSubject,
      grade: starterGrade,
    });
    if (slugFromQuery) {
      qs.set("slug", slugFromQuery);
    }
    return `/checkout?${qs.toString()}`;
  }, [starterSubject, starterGrade, slugFromQuery]);

  const goStarter = () => navigate(starterHref);

  // Pro 方案：同樣把 slug 帶過去（subject/grade 由後台自己決定要點用）
  const goPro = () => {
    const qs = new URLSearchParams({ plan: "pro" });
    if (slugFromQuery) qs.set("slug", slugFromQuery);
    navigate(`/checkout?${qs.toString()}`);
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* 頂部標題＋回練習頁 */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">方案與收費</h1>
        <Link to="/packs" className="text-sm underline">
          ← 回練習頁
        </Link>
      </div>

      {/* 方案卡片 */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Free */}
        <div className="rounded-2xl border p-6 shadow-sm bg-white/70">
          <h2 className="mb-2 text-xl font-semibold">Free</h2>
          <p className="mb-4 text-sm text-gray-600">
            基本練習、少量題包、無家長報告
          </p>
          <ul className="mb-6 list-disc pl-5 text-sm space-y-1">
            <li>可做免費練習</li>
            <li>基本答題統計</li>
          </ul>
          <div className="text-lg font-bold">HK$0</div>
        </div>

        {/* Starter */}
        <div className="rounded-2xl border p-6 shadow-sm ring-2 ring-indigo-500 bg-white">
          <h2 className="mb-2 text-xl font-semibold">Starter</h2>
          <p className="mb-4 text-sm text-gray-600">
            解鎖「指定針對科目＋年級」，支援家長報告
          </p>

          {/* 先選科目 + 年級 */}
          <div className="mb-4 grid grid-cols-1 gap-3">
            <label className="text-sm font-medium">
              選擇科目
              <select
                className="mt-1 w-full rounded-lg border px-3 py-2"
                value={starterSubject}
                onChange={(e) => setStarterSubject(e.target.value)}
              >
                {SUBJECTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm font-medium">
              選擇年級
              <select
                className="mt-1 w-full rounded-lg border px-3 py-2"
                value={starterGrade}
                onChange={(e) => setStarterGrade(e.target.value)}
              >
                {GRADES.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <ul className="mb-6 list-disc pl-5 text-sm space-y-1">
            <li>指定科目＋年級全練習</li>
            <li>家長報告（Email）</li>
          </ul>

          <div className="mb-4 text-lg font-bold">HK$48 / 月</div>

          <button
            onClick={goStarter}
            className="inline-block rounded-xl border px-4 py-2 hover:bg-gray-50"
          >
            前往購買
          </button>
        </div>

        {/* Pro */}
        <div className="rounded-2xl border p-6 shadow-sm bg-white/70">
          <h2 className="mb-2 text-xl font-semibold">Pro</h2>
          <p className="mb-4 text-sm text-gray-600">
            全部科目年級、進階追蹤與練習建議
          </p>
          <ul className="mb-6 list-disc pl-5 text-sm space-y-1">
            <li>全部練習</li>
            <li>家長報告＋歷史紀錄</li>
            <li>推薦練習</li>
          </ul>
          <div className="mb-4 text-lg font-bold">HK$80 / 月</div>
          <button
            onClick={goPro}
            className="inline-block rounded-xl border px-4 py-2 hover:bg-gray-50"
          >
            前往購買
          </button>
        </div>
      </div>

      {/* 對照表 */}
      <div className="mt-8 text-sm text-gray-600">
        想知道「免費 vs 付費」差異？下方有完整對照表。
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3">功能</th>
              <th className="px-4 py-3">Free</th>
              <th className="px-4 py-3">Starter</th>
              <th className="px-4 py-3">Pro</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t">
              <td className="px-4 py-3">可用選項</td>
              <td className="px-4 py-3">部分免費</td>
              <td className="px-4 py-3">指定科目＋年級</td>
              <td className="px-4 py-3">全部</td>
            </tr>
            <tr className="border-t">
              <td className="px-4 py-3">家長報告（Email）</td>
              <td className="px-4 py-3">—</td>
              <td className="px-4 py-3">✓</td>
              <td className="px-4 py-3">✓</td>
            </tr>
            <tr className="border-t">
              <td className="px-4 py-3">推薦練習</td>
              <td className="px-4 py-3">—</td>
              <td className="px-4 py-3">—</td>
              <td className="px-4 py-3">✓</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
