// apps/frontend/src/components/Layout.tsx
import React from "react";
import { useEntitlement } from "../hooks/useEntitlement";

export default function Layout({ children }: { children: React.ReactNode }) {
  const { adsEnabled } = useEntitlement();

  return (
    <>
      {/* 這裡放你的 Header / Nav */}
      <main>{children}</main>

      {/* 只有免費/Starter 才渲染 AdSense 區塊 */}
      {adsEnabled && (
        <div className="my-4 text-center">
          <ins
            className="adsbygoogle"
            style={{ display: "block" }}
            data-ad-client="ca-pub-xxxxxxxxxxxxxxxx"
            data-ad-slot="1234567890"
            data-ad-format="auto"
            data-full-width-responsive="true"
          />
        </div>
      )}
    </>
  );
}
