// apps/frontend/src/components/AccountBadge.tsx
import { useEntitlement } from "../hooks/useEntitlement";

export default function AccountBadge() {
  const { plan, email } = useEntitlement(); // 後端 /api/user/entitlement 可順手回 email；或前端另打 /api/user/me
  return (
    <div className="text-sm text-gray-600 flex items-center gap-2">
      <span className="rounded-full px-2 py-0.5 bg-gray-100 border">
        {plan?.toUpperCase() || "FREE"}
      </span>
      {email ? <span>{email}</span> : <span className="opacity-70">未連結 email</span>}
      {/* 之後要加 Magic Link 再把下面按鈕打開 */}
      {/* <button className="underline">連結/登入</button> */}
    </div>
  );
}
