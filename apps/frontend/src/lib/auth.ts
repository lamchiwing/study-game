// apps/frontend/src/lib/auth.ts
const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/+$/, "") ||
  "https://study-game-back.onrender.com";

const STORAGE_KEY = "sg_auth";

export type PlanType = "free" | "starter" | "pro";

export type AuthUser = {
  token: string;
  email: string;
  plan: PlanType | string; // 後端如果將來加其他 plan，都唔會爆
  starter_subject?: string | null;
  starter_grade?: string | null;
};

// 從 localStorage 讀取已登入用戶
export function loadStoredAuth(): AuthUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed.token || !parsed.email) return null;
    return parsed as AuthUser;
  } catch {
    return null;
  }
}

// 寫入 localStorage
export function saveAuth(user: AuthUser | null) {
  if (!user) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
}

// 登出
export function clearAuth() {
  saveAuth(null);
}

// 呼叫後端：請求登入驗證碼
export async function requestLoginCode(email: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/auth/request-code`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email }),
  });

  if (!res.ok) {
    let msg = "請求驗證碼失敗";
    try {
      const data = await res.json();
      msg = data.detail || msg;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }
}

// 呼叫後端：驗證登入碼，成功則回傳 AuthUser 並存入 localStorage
export async function verifyLoginCode(
  email: string,
  code: string
): Promise<AuthUser> {
  const res = await fetch(`${API_BASE}/api/auth/verify-code`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, code }),
  });

  if (!res.ok) {
    let msg = "驗證失敗";
    try {
      const data = await res.json();
      msg = data.detail || msg;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }

  const data = (await res.json()) as {
    token: string;
    email: string;
    plan: string;
    starter_subject?: string | null;
    starter_grade?: string | null;
  };

  const user: AuthUser = {
    token: data.token,
    email: data.email,
    plan: data.plan,
    starter_subject: data.starter_subject ?? null,
    starter_grade: data.starter_grade ?? null,
  };

  saveAuth(user);
  return user;
}

// 產生 Authorization header 用於之後有需要 auth 的 API call
export function authHeader(user?: AuthUser | null): Record<string, string> {
  const u = user ?? loadStoredAuth();
  if (!u?.token) return {};
  return {
    Authorization: `Bearer ${u.token}`,
  };
}

// helper：是否 Pro
export function isPro(user?: AuthUser | null): boolean {
  const u = user ?? loadStoredAuth();
  return u?.plan === "pro";
}

// helper：是否擁有指定 subject+grade（Starter 或 Pro）
export function hasAccessToPack(
  subject: string | undefined,
  grade: string | undefined,
  user?: AuthUser | null
): boolean {
  const u = user ?? loadStoredAuth();
  if (!subject || !grade || !u) return false;
  if (u.plan === "pro") return true;
  if (u.plan === "starter") {
    return (
      u.starter_subject === subject &&
      u.starter_grade === grade
    );
  }
  return false;
}
