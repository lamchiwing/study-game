// apps/frontend/src/components/Navbar.tsx
import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function Navbar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (path: string) =>
    location.pathname === path
      ? "text-black"
      : "text-gray-500 hover:text-black";

  function handleLogout() {
    logout();
    navigate("/", { replace: true });
  }

  function goLogin() {
    const next = location.pathname + location.search;
    navigate(`/login?next=${encodeURIComponent(next)}`);
  }

  return (
    <header className="border-b bg-white">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        {/* 左邊 Logo / 導航 */}
        <div className="flex items-center gap-4">
          <Link to="/packs" className="text-base font-semibold">
            Study Game
          </Link>
          <nav className="hidden gap-3 text-sm sm:flex">
            <Link to="/packs" className={isActive("/packs")}>
              題庫
            </Link>
            <Link to="/pricing" className={isActive("/pricing")}>
              收費方案
            </Link>
          </nav>
        </div>

        {/* 右邊：登入狀態 */}
        <div className="flex items-center gap-3 text-sm">
          {user ? (
            <>
              <span className="hidden text-gray-700 sm:inline">
                你好，<span className="font-medium">{user.email}</span>
              </span>
              <button
                onClick={handleLogout}
                className="rounded border px-3 py-1 text-xs sm:text-sm"
              >
                Logout
              </button>
            </>
          ) : (
            <button
              onClick={goLogin}
              className="rounded border px-3 py-1 text-xs sm:text-sm"
            >
              登入
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
