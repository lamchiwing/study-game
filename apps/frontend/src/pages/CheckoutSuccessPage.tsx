// apps/frontend/src/pages/CheckoutSuccessPage.tsx
import React, { useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";

export default function CheckoutSuccessPage() {
  const navigate = useNavigate();
  const [sp] = useSearchParams();

  // 付款成功後從 URL 取得資料
  const slug = sp.get("slug") || "";
  const subject = sp.get("subject") || "";
  const grade = sp.get("grade") || "";

  // Locker Key（你之前定義的格式：sg_paid_subject_grade）
  const ENTITLE_KEY =
    subject && grade ? `sg_paid_${subject}_${grade}` : null;

  useEffect(() => {
    // 1️⃣ 寫入 localStorage（解鎖 pack）
    if (ENTITLE_KEY) {
      localStorage.setItem(ENTITLE_KEY, "1");
    }

    // 2️⃣ 3 秒後自動返回 Quiz（帶 unlock=1）
    if (slug) {
      const timer = setTimeout(() => {
        navigate(`/quiz?slug=${encodeURIComponent(slug)}&unlock=1`);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [navigate, slug, subject, grade]);

  return (
    <div className="mx-auto max-w-xl p-6 space-y-6">
      <h1 className="text-3xl font-bold text-emerald-600">
        ✓ 付款成功！
      </h1>

      <p className="text-gray-700 text-lg">
        感謝您支持孩子的學習進度！  
        家長方案已成功啟動，此科目／年級的「答案報告」已解鎖。
      </p>

      <div className="rounded border border-emerald-300 bg-emerald-50 p-4 text-emerald-800">
        即將自動返回題目頁並展示完整的答案與解析…
      </div>

      {slug ? (
        <Link
          to={`/quiz?slug=${encodeURIComponent(slug)}&unlock=1`}
          className="inline-block rounded bg-black px-4 py-2 text-white"
        >
          👉 立即查看完整答案報告
        </Link>
      ) : (
        <Link to="/packs" className="underline text-sm">
          返回練習列表
        </Link>
      )}

      <div className="text-xs text-gray-500">
        若 3 秒後未自動跳轉，請按上面按鈕。
      </div>
    </div>
  );
}
