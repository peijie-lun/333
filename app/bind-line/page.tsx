"use client";

import { useEffect, useState } from "react";

export default function BindLinePage() {
  const [liffObject, setLiffObject] = useState<any>(null);
  const [status, setStatus] = useState("載入中...");
  const [profile, setProfile] = useState<any>(null);
  const [user, setUser] = useState<any>(null); // 登入後的使用者
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const LIFF_ID = "2008678437-qt2KwvhO"; // ← 你的 LIFF ID

  useEffect(() => {
    const initLiff = async () => {
      const liff = (await import("@line/liff")).default;
      try {
        await liff.init({ liffId: LIFF_ID });
        setLiffObject(liff);
        setStatus("請先登入或註冊帳號，再綁定 LINE");
      } catch (err) {
        console.error("LIFF init failed", err);
        setStatus("LIFF 初始化失敗，請稍後再試");
      }
    };

    initLiff();
  }, []);

  // 註冊
  const handleRegister = async () => {
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (data.success) {
        setUser(data.user);
        setStatus("註冊成功，請綁定 LINE");
      } else {
        setStatus("註冊失敗：" + (data.message || "未知錯誤"));
      }
    } catch (err) {
      console.error(err);
      setStatus("註冊發生錯誤");
    }
  };

  // 登入
  const handleLogin = async () => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (data.success) {
        setUser(data.user);
        setStatus("登入成功，請綁定 LINE");
      } else {
        setStatus("登入失敗：" + (data.message || "未知錯誤"));
      }
    } catch (err) {
      console.error(err);
      setStatus("登入發生錯誤");
    }
  };

  // 綁定 LINE
  const handleBindClick = async () => {
    if (!liffObject) return;
    if (!user) {
      setStatus("請先登入或註冊帳號");
      return;
    }

    try {
      if (!liffObject.isLoggedIn()) {
        liffObject.login();
        return;
      }

      setStatus("綁定中...");

      const profileData = await liffObject.getProfile();
      setProfile(profileData);

      const res = await fetch("/api/bind-line", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile_id: user.id, // 將使用者 id 傳給後端
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
      <h1 className="text-2xl font-bold">註冊 / 登入 + 綁定 LINE</h1>
      <p className="text-gray-700">{status}</p>

      {!user && (
        <div className="flex flex-col gap-4 w-80">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border px-3 py-2 rounded"
          />
          <input
            type="password"
            placeholder="密碼"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="border px-3 py-2 rounded"
          />
          <div className="flex gap-4">
            <button
              onClick={handleRegister}
              className="flex-1 bg-blue-500 text-white py-2 rounded hover:bg-blue-600"
            >
              註冊
            </button>
            <button
              onClick={handleLogin}
              className="flex-1 bg-green-500 text-white py-2 rounded hover:bg-green-600"
            >
              登入
            </button>
          </div>
        </div>
      )}

      {user && !profile && (
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
