// apps/frontend/src/hooks/useAuth.tsx
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import {
  AuthUser,
  loadStoredAuth,
  saveAuth,
  clearAuth,
  requestLoginCode,
  verifyLoginCode,
  hasAccessToPack,
  isPro,
} from "../lib/auth";

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;

  // auth flows
  requestCode: (email: string) => Promise<void>;
  verifyCode: (email: string, code: string) => Promise<void>;
  logout: () => void;

  // helpers
  isPro: boolean;
  hasAccessToPack: (subject?: string, grade?: string) => boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // 初始化：從 localStorage 載入
  useEffect(() => {
    const u = loadStoredAuth();
    setUser(u);
    setLoading(false);
  }, []);

  const handleRequestCode = async (email: string) => {
    await requestLoginCode(email);
  };

  const handleVerifyCode = async (email: string, code: string) => {
    const u = await verifyLoginCode(email, code);
    setUser(u);
  };

  const handleLogout = () => {
    clearAuth();
    setUser(null);
  };

  const value: AuthContextValue = {
    user,
    loading,
    requestCode: handleRequestCode,
    verifyCode: handleVerifyCode,
    logout: handleLogout,
    isPro: isPro(user),
    hasAccessToPack: (subject?: string, grade?: string) =>
      hasAccessToPack(subject, grade, user),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// hook 給 component 用
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within <AuthProvider>");
  }
  return ctx;
}
