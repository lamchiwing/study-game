import { Link } from "react-router-dom";

export default function PricingPage() {
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
          <p className="mb-4 text-sm text-gray-600">基本練習、少量題包、無家長報告</p>
          <ul className="mb-6 list-disc pl-5 text-sm space-y-1">
            <li>可做免費題包</li>
            <li>基本答題統計（本機）</li>
          </ul>
          <div className="text-lg font-bold">HK$0</div>
        </div>

        {/* Starter */}
        <div className="rounded-2xl border p-6 shadow-sm ring-2 ring-indigo-500 bg-white">
          <h2 className="mb-2 text-xl font-semibold">Starter</h2>
          <p className="mb-4 text-sm text-gray-600">解鎖指定科目＋年級題包、家長報告</p>
          <ul className="mb-6 list-disc pl-5 text-sm space-y-1">
            <li>指定科目＋年級全題包</li>
            <li>家長報告（Email）</li>
          </ul>
          <div className="mb-4 text-lg font-bold">HK$?? / 月</div>
          <Link
            to="/checkout?plan=starter"
            className="inline-block rounded-xl border px-4 py-2 hover:bg-gray-50"
          >
            前往購買
          </Link>
        </div>

        {/* Pro */}
        <div className="rounded-2xl border p-6 shadow-sm bg-white/70">
          <h2 className="mb-2 text-xl font-semibold">Pro</h2>
          <p className="mb-4 text-sm text-gray-600">全部科目年級、進階追蹤與練習建議</p>
          <ul className="mb-6 list-disc pl-5 text-sm space-y-1">
            <li>全部題包</li>
            <li>家長報告＋歷史紀錄</li>
            <li>AI 推薦練習</li>
          </ul>
          <div className="mb-4 text-lg font-bold">HK$?? / 月</div>
          <Link
            to="/checkout?plan=pro"
            className="inline-block rounded-xl border px-4 py-2 hover:bg-gray-50"
          >
            前往購買
          </Link>
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
              <td className="px-4 py-3">可用題包</td>
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
