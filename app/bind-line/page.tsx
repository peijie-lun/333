"use client";

import { useEffect, useState } from "react";

export default function BindLinePage() {
  const [liffObject, setLiffObject] = useState<any>(null);
  const [isReady, setIsReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const LIFF_ID = "2008678437-qt2KwvhO"; // ← 你的 LIFF ID

  // 初始化 LIFF
  useEffect(() => {
    const initLiff = async () => {
      const liff = (await import("@line/liff")).default;
      try {
        await liff.init({ liffId: LIFF_ID });
        setLiffObject(liff);
        setIsReady(true);

        // 可選：自動綁定（不用按按鈕）
        // handleBind(liff);
      } catch (err) {
        console.error("LIFF init failed", err);
      }
    };
    initLiff();
  }, []);

  // 綁定 LINE
  const handleBind = async (liffInstance?: any) => {
    const liffClient = liffInstance || liffObject;
    if (!liffClient) return;

    if (loading) return;
    setLoading(true);

    try {
      // 若未登入 LINE
      if (!liffClient.isLoggedIn()) {
        liffClient.login();
        return;
      }

      // 取得 LINE 使用者資料
      const profile = await liffClient.getProfile();

      // 送到後端 API
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
        alert("LINE 綁定成功！");
      } else {
        alert("綁定失敗：" + (data.message || "未知錯誤"));
      }
    } catch (err) {
      console.error(err);
      alert("綁定發生錯誤，請稍後再試");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex flex-col items-center p-10 gap-6">
      <h1 className="text-2xl font-bold">綁定 LINE 帳號</h1>

      {!isReady && <p>載入中...</p>}

      {isReady && (
        <button
          onClick={() => handleBind()}
          disabled={loading}
          className="px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 active:scale-95 disabled:opacity-50"
        >
          {loading ? "綁定中..." : "使用 LINE 綁定帳號"}
        </button>
      )}
    </main>
  );
}
