// apps/frontend/src/hooks/useEntitlement.ts
import { useEffect, useState } from "react";

export function useEntitlement() {
  const [adsEnabled, setAdsEnabled] = useState(true);
  const [plan, setPlan] = useState<"starter" | "pro" | string>("starter");

  const base = (import.meta.env.VITE_API_BASE || "").replace(/\/+$/, "");
  const uid = localStorage.getItem("uid") || "";

  useEffect(() => {
    if (!uid || !base) return;
    fetch(`${base}/api/user/entitlement`, {
      headers: { "X-User-Id": uid },
      credentials: "include",
    })
      .then(r => r.json())
      .then(d => {
        setPlan(d?.plan || "starter");
        setAdsEnabled(!!d?.ads_enabled);
      })
      .catch(() => setAdsEnabled(true));
  }, [uid, base]);

  return { adsEnabled, plan };
}
