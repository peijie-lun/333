"use client";

import { useEffect, useState } from "react";

export default function BindLinePage() {
  const [liffObject, setLiffObject] = useState<any>(null);
  const [status, setStatus] = useState("載入中...");
  const [profile, setProfile] = useState<any>(null);
  const LIFF_ID = "2008678437-qt2KwvhO"; // ← 你的 LIFF ID

  useEffect(() => {
    const initLiff = async () => {
      const liff = (await import("@line/liff")).default;
      try {
        await liff.init({ liffId: LIFF_ID });
        setLiffObject(liff);
        setStatus("請點擊按鈕綁定 LINE 帳號");
      } catch (err) {
        console.error("LIFF init failed", err);
        setStatus("LIFF 初始化失敗，請稍後再試");
      }
    };

    initLiff();
  }, []);

  const handleBindClick = async () => {
    if (!liffObject) return;

    try {
      // 若未登入 → 先登入 LINE
      if (!liffObject.isLoggedIn()) {
        liffObject.login();
        return;
      }

      setStatus("綁定中...");

      // 取得 LINE 使用者資料
      const profileData = await liffObject.getProfile();
      setProfile(profileData); // 儲存 profile，方便 UI 顯示

      // 呼叫後端 API upsert
      const res = await fetch("/api/bind-line", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          line_user_id: profileData.userId,
          line_display_name: profileData.displayName,
          line_avatar_url: profileData.pictureUrl,
          line_status_message: profileData.statusMessage,
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
      <h1 className="text-2xl font-bold">綁定 LINE 帳號</h1>
      <p className="text-gray-700">{status}</p>

      {!profile && (
        <button
          onClick={handleBindClick}
          className="px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 active:scale-95"
        >
          使用 LINE 綁定帳號
        </button>
      )}

      {profile && (
        <div className="flex flex-col items-center mt-4">
          <img
            src={profile.pictureUrl}
            alt="LINE 大頭貼"
            className="w-24 h-24 rounded-full"
          />
          <p className="mt-2 font-semibold">{profile.displayName}</p>
        </div>
      )}
    </main>
  );
}
