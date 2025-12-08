// apps/frontend/src/pages/LoginPage.tsx
import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

type Step = "email" | "code";

export default function LoginPage() {
  const { user, requestCode, verifyCode } = useAuth();
  const [sp] = useSearchParams();
  const navigate = useNavigate();

  // URL ?next=/xxx，用來登入後跳轉
  const next = sp.get("next") || "/packs";

  const [step, setStep] = useState<Step>(user ? "code" : "email");
  const [email, setEmail] = useState<string>(user?.email || "");
  const [code, setCode] = useState<string>("");

  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleRequestCode(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);

    const trimmed = email.trim();
    if (!trimmed) {
      setErrorMsg("請輸入電郵地址");
      return;
    }

    setSending(true);
    try {
      await requestCode(trimmed);
      setInfoMsg("驗證碼已發送，請查收電郵（10 分鐘內有效）。");
      setStep("code");
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err?.message || "發送驗證碼時出現問題，請稍後再試。");
    } finally {
      setSending(false);
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);

    const trimmedEmail = email.trim();
    const trimmedCode = code.trim();

    if (!trimmedEmail) {
      setErrorMsg("請先輸入電郵地址");
      return;
    }
    if (!trimmedCode) {
      setErrorMsg("請輸入 6 位數字驗證碼");
      return;
    }

    setVerifying(true);
    try {
      await verifyCode(trimmedEmail, trimmedCode);
      setInfoMsg("登入成功！");
      // 登入成功後跳轉
      navigate(next, { replace: true });
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err?.message || "驗證碼錯誤或已過期。");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <h1 className="mb-4 text-2xl font-semibold">登入家長帳戶</h1>

      {infoMsg && (
        <div className="mb-3 rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {infoMsg}
        </div>
      )}
      {errorMsg && (
        <div className="mb-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {errorMsg}
        </div>
      )}

      {/* Step 1：輸入 email */}
      <form
        onSubmit={step === "email" ? handleRequestCode : handleVerifyCode}
        className="space-y-4 rounded border bg-white p-4 shadow-sm"
      >
        <div className="space-y-1">
          <label className="text-sm font-medium">電郵地址</label>
          <input
            type="email"
            value={email}
            autoComplete="email"
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded border px-3 py-2 text-sm"
            placeholder="parent@example.com"
          />
          <p className="text-xs text-gray-500">
            我們會發送一次性登入驗證碼到此電郵，無需密碼。
          </p>
        </div>

        {/* Step 2：輸入驗證碼 */}
        {step === "code" && (
          <div className="space-y-1">
            <label className="text-sm font-medium">驗證碼</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="w-full rounded border px-3 py-2 text-sm tracking-[0.3em]"
              placeholder="6 位數字（10 分鐘內有效）"
            />
            <p className="text-xs text-gray-500">
              已發送到：<span className="font-mono">{email}</span>
            </p>
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          {step === "code" ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setStep("email");
                  setCode("");
                  setInfoMsg(null);
                  setErrorMsg(null);
                }}
                className="rounded border px-3 py-2 text-sm"
              >
                ← 改電郵
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleRequestCode}
                  disabled={sending}
                  className="rounded border px-3 py-2 text-sm disabled:opacity-50"
                >
                  {sending ? "重新發送中…" : "重新發送"}
                </button>
                <button
                  type="submit"
                  disabled={verifying}
                  className="rounded bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {verifying ? "登入中…" : "確認登入"}
                </button>
              </div>
            </>
          ) : (
            <>
              <span />
              <button
                type="submit"
                disabled={sending}
                className="rounded bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {sending ? "發送中…" : "發送驗證碼"}
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}
