"use client";

import { useEffect, useState } from "react";

export default function BindLinePage() {
  const [liffObject, setLiffObject] = useState<any>(null);
  const [status, setStatus] = useState("載入中...");
  const LIFF_ID = "2008678437-qt2KwvhO"; // ← 你的 LIFF ID

  useEffect(() => {
    const initLiff = async () => {
      const liff = (await import("@line/liff")).default;
      try {
        await liff.init({ liffId: LIFF_ID });
        setLiffObject(liff);

        // 自動綁定
        await autoBind(liff);
      } catch (err) {
        console.error("LIFF init failed", err);
        setStatus("LIFF 初始化失敗，請稍後再試");
      }
    };

    initLiff();
  }, []);

  const autoBind = async (liffClient: any) => {
    try {
      // 若未登入 → 先登入 LINE
      if (!liffClient.isLoggedIn()) {
        liffClient.login();
        return;
      }

      setStatus("綁定中...");

      // 取得 LINE 使用者資料
      const profile = await liffClient.getProfile();

      // 呼叫後端 API upsert
      const res = await fetch("/api/bind-line", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          line_user_id: profile.userId,
          line_display_name: profile.displayName,
          line_avatar_url: profile.pictureUrl,
          line_status_message: profile.statusMessage,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setStatus("LINE 已成功綁定！");
      } else {
        setStatus("綁定失敗：" + (data.message || "未知錯誤"));
      }
    } catch (err) {
      console.error(err);
      setStatus("綁定發生錯誤，請稍後再試");
    }
  };

  return (
    <main className="flex flex-col items-center p-10 gap-6">
      <h1 className="text-2xl font-bold">LINE 帳號自動綁定</h1>
      <p className="text-gray-700">{status}</p>
    </main>
  );
}
