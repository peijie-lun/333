"use client";

import { useEffect, useState } from "react";

export default function BindLinePage() {
  const [liffObject, setLiffObject] = useState<any>(null);
  const [isReady, setIsReady] = useState(false);
  const LIFF_ID = "2008678437-qt2KwvhO"; // ← 這裡放你的 LIFF ID

  useEffect(() => {
    const initLiff = async () => {
      const liff = (await import("@line/liff")).default;
      try {
        await liff.init({ liffId: LIFF_ID });
        setLiffObject(liff);
        setIsReady(true);
      } catch (err) {
        console.error("LIFF init failed", err);
      }
    };
    initLiff();
  }, []);

  const handleBind = async () => {
    if (!liffObject) return;

    // 若沒登入 → 先登入
    if (!liffObject.isLoggedIn()) {
      liffObject.login();
      return;
    }

    // 取得 LINE 使用者資訊
    const profile = await liffObject.getProfile();

    // 送到你的後端 /api/bind-line (自行建立)
    await fetch("/api/bind-line", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        line_user_id: profile.userId,
        line_display_name: profile.displayName,
        line_avatar_url: profile.pictureUrl,
        line_status_message: profile.statusMessage,        
      }),
    });

    alert("LINE 綁定成功！");
  };

  return (
    <main className="flex flex-col items-center p-10 gap-6">
      <h1 className="text-2xl font-bold">綁定 LINE 帳號</h1>

      {!isReady && <p>載入中...</p>}

      {isReady && (
        <button
          onClick={handleBind}
          className="px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 active:scale-95"
        >
          使用 LINE 綁定帳號
        </button>
      )}
    </main>
  );
}
