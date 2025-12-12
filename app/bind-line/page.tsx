"use client";

import { useEffect, useState, useRef } from "react";

export default function BindLinePage() {
  const [liffObject, setLiffObject] = useState<any>(null);
  const [status, setStatus] = useState("載入中...");
  const [profile, setProfile] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [isBinding, setIsBinding] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const bindingAttempted = useRef(false);
  
  const LIFF_ID = "2008678437-qt2KwvhO";

  // 初始化 LIFF
  useEffect(() => {
    const initLiff = async () => {
      try {
        const liff = (await import("@line/liff")).default;
        await liff.init({ liffId: LIFF_ID });
        setLiffObject(liff);
        setStatus("請先登入或註冊帳號，再綁定 LINE");
        console.log("✅ LIFF 初始化成功");
      } catch (err) {
        console.error("❌ LIFF 初始化失敗", err);
        setStatus("LIFF 初始化失敗，請重新整理頁面");
      }
    };
    initLiff();
  }, []);

  // 統一的綁定邏輯
  const performBinding = async () => {
    if (!liffObject || !user || isBinding || profile) {
      return;
    }

    // 檢查 user.id（UUID 格式）
    if (!user.id) {
      console.error("❌ user.id 不存在，user:", user);
      setStatus("使用者資料異常，請重新登入");
      setUser(null);
      return;
    }

    // 檢查 LINE 登入狀態
    if (!liffObject.isLoggedIn()) {
      console.log("ℹ️ 需要 LINE 登入");
      return;
    }

    setIsBinding(true);
    setStatus("正在綁定 LINE...");
    console.log("🔗 開始綁定流程，profile_id:", user.id);

    try {
      const profileData = await liffObject.getProfile();
      console.log("📥 取得 LINE Profile:", {
        userId: profileData.userId,
        displayName: profileData.displayName
      });

      const res = await fetch("/api/bind-line", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile_id: user.id,
          line_user_id: profileData.userId,
          line_display_name: profileData.displayName,
          line_avatar_url: profileData.pictureUrl,
          line_status_message: profileData.statusMessage,
        }),
      });

      const data = await res.json();
      console.log("📨 綁定 API 回應:", data);

      if (data.success) {
        setProfile(profileData);
        setStatus("✓ LINE 綁定成功！");
        bindingAttempted.current = true;
      } else {
        setStatus(`綁定失敗：${data.message || "未知錯誤"}`);
        setProfile(null);
      }
    } catch (err: any) {
      console.error("❌ 綁定失敗:", err);
      setStatus(`綁定發生錯誤：${err.message || "請稍後再試"}`);
      setProfile(null);
    } finally {
      setIsBinding(false);
    }
  };

  // 自動綁定 (LIFF 登入後)
  useEffect(() => {
    if (liffObject && user && liffObject.isLoggedIn() && !bindingAttempted.current) {
      console.log("🤖 偵測到 LIFF 已登入且 user 存在，自動執行綁定");
      performBinding();
    }
  }, [liffObject, user]);

  // 註冊
  const handleRegister = async () => {
    if (!email || !password) {
      setStatus("⚠️ 請輸入 Email 和密碼");
      return;
    }

    // Email 格式驗證
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setStatus("⚠️ Email 格式不正確");
      return;
    }

    // 密碼長度驗證
    if (password.length < 6) {
      setStatus("⚠️ 密碼至少需要 6 個字元");
      return;
    }

    setIsLoading(true);
    setStatus("註冊中...");

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          email, 
          password,
          name: name || null,
          phone: phone || null
        }),
      });
      const data = await res.json();
      
      console.log("📨 註冊回應:", data);

      if (data.success && data.user && data.user.id) {
        setUser(data.user);
        setStatus("✓ 註冊成功！請點擊下方綁定 LINE");
        console.log("✅ 註冊成功，user:", data.user);
        
        // 清空表單
        setEmail("");
        setPassword("");
        setName("");
        setPhone("");
      } else {
        setStatus(`註冊失敗：${data.message || "未知錯誤"}`);
      }
    } catch (err: any) {
      console.error("❌ 註冊錯誤:", err);
      setStatus(`註冊發生錯誤：${err.message || "請稍後再試"}`);
    } finally {
      setIsLoading(false);
    }
  };

  // 登入
  const handleLogin = async () => {
    if (!email || !password) {
      setStatus("⚠️ 請輸入 Email 和密碼");
      return;
    }

    setIsLoading(true);
    setStatus("登入中...");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      
      console.log("📨 登入回應:", data);

      if (data.success && data.user && data.user.id) {
        setUser(data.user);
        
        // 如果已經綁定過 LINE，直接顯示資訊
        if (data.user.line_bound) {
          setProfile({
            userId: data.user.line_user_id,
            displayName: data.user.line_display_name,
            pictureUrl: data.user.line_avatar_url,
            statusMessage: data.user.line_status_message
          });
          setStatus("✓ 登入成功！您的帳號已綁定 LINE");
          bindingAttempted.current = true;
        } else {
          setStatus("✓ 登入成功！請點擊下方綁定 LINE");
        }
        
        console.log("✅ 登入成功，user:", data.user);
        
        // 清空表單
        setEmail("");
        setPassword("");
      } else {
        setStatus(`登入失敗：${data.message || "未知錯誤"}`);
      }
    } catch (err: any) {
      console.error("❌ 登入錯誤:", err);
      setStatus(`登入發生錯誤：${err.message || "請稍後再試"}`);
    } finally {
      setIsLoading(false);
    }
  };

  // 手動觸發綁定
  const handleBindClick = async () => {
    if (!liffObject) {
      setStatus("⚠️ LIFF 尚未初始化");
      return;
    }
    
    if (!user) {
      setStatus("⚠️ 請先登入或註冊帳號");
      return;
    }

    if (!user.id) {
      console.error("❌ user.id 不存在，user:", user);
      setStatus("使用者資料異常，請重新登入");
      setUser(null);
      return;
    }

    // 若 LINE 尚未登入，導向 LINE 登入
    if (!liffObject.isLoggedIn()) {
      console.log("🔐 導向 LINE 登入");
      setStatus("正在導向 LINE 登入...");
      liffObject.login();
      return;
    }

    // 執行綁定
    await performBinding();
  };

  // 登出
  const handleLogout = () => {
    setUser(null);
    setProfile(null);
    bindingAttempted.current = false;
    setStatus("已登出，請重新登入或註冊");
    console.log("🔓 已清除狀態");
  };

  // 解除 LINE 綁定
  const handleUnbind = async () => {
    if (!user || !user.id) return;

    const confirmed = confirm("確定要解除 LINE 綁定嗎？");
    if (!confirmed) return;

    setIsLoading(true);
    setStatus("解除綁定中...");

    try {
      const res = await fetch("/api/bind-line", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile_id: user.id }),
      });

      const data = await res.json();

      if (data.success) {
        setProfile(null);
        bindingAttempted.current = false;
        setStatus("✓ LINE 綁定已解除");
        console.log("✅ LINE 綁定已解除");
      } else {
        setStatus(`解除綁定失敗：${data.message || "未知錯誤"}`);
      }
    } catch (err: any) {
      console.error("❌ 解除綁定錯誤:", err);
      setStatus(`解除綁定發生錯誤：${err.message || "請稍後再試"}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex flex-col items-center p-10 gap-6 min-h-screen bg-gray-50">
      <div className="w-full max-w-md bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-3xl font-bold text-center mb-2">LINE 帳號綁定</h1>
        <p className="text-center text-gray-600 mb-6">註冊或登入後綁定您的 LINE 帳號</p>
        
        {/* 狀態訊息 */}
        <div className={`p-4 rounded-lg mb-6 text-center ${
          status.includes("成功") || status.includes("✓") 
            ? "bg-green-50 text-green-700 border border-green-200" 
            : status.includes("失敗") || status.includes("❌") || status.includes("⚠️")
            ? "bg-red-50 text-red-700 border border-red-200"
            : "bg-blue-50 text-blue-700 border border-blue-200"
        }`}>
          {status}
        </div>

        {/* 註冊 / 登入表單 */}
        {!user && (
          <div className="flex flex-col gap-4">
            <input
              type="text"
              placeholder="姓名（選填）"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="border border-gray-300 px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isLoading}
            />
            <input
              type="tel"
              placeholder="電話（選填）"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="border border-gray-300 px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isLoading}
            />
            <input
              type="email"
              placeholder="Email *"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="border border-gray-300 px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isLoading}
              required
            />
            <input
              type="password"
              placeholder="密碼（至少 6 個字元）*"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="border border-gray-300 px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isLoading}
              required
            />
            <div className="flex gap-4">
              <button
                onClick={handleRegister}
                disabled={isLoading}
                className="flex-1 bg-blue-500 text-white py-3 rounded-lg hover:bg-blue-600 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold"
              >
                {isLoading ? "處理中..." : "註冊"}
              </button>
              <button
                onClick={handleLogin}
                disabled={isLoading}
                className="flex-1 bg-green-500 text-white py-3 rounded-lg hover:bg-green-600 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold"
              >
                {isLoading ? "處理中..." : "登入"}
              </button>
            </div>
          </div>
        )}

        {/* 綁定 LINE */}
        {user && !profile && (
          <div className="flex flex-col items-center gap-4">
            <div className="bg-gray-50 p-4 rounded-lg w-full">
              <p className="text-sm text-gray-600">已登入帳號</p>
              <p className="font-semibold text-lg">{user.email}</p>
              {user.name && <p className="text-gray-600">{user.name}</p>}
            </div>
            <button
              onClick={handleBindClick}
              disabled={isBinding || isLoading}
              className="w-full py-4 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-all active:scale-95 disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold text-lg shadow-md"
            >
              {isBinding ? "綁定中..." : "🔗 使用 LINE 綁定帳號"}
            </button>
            <button
              onClick={handleLogout}
              className="px-6 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
            >
              登出
            </button>
          </div>
        )}

        {/* 顯示 LINE Profile */}
        {profile && (
          <div className="flex flex-col items-center">
            <div className="relative">
              <img
                src={profile.pictureUrl}
                alt="LINE 大頭貼"
                className="w-32 h-32 rounded-full border-4 border-green-500 shadow-lg"
              />
              <div className="absolute -bottom-2 -right-2 bg-green-500 text-white rounded-full p-2">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
            </div>
            <p className="mt-4 font-bold text-xl">{profile.displayName}</p>
            {profile.statusMessage && (
              <p className="text-sm text-gray-500 italic mt-1">"{profile.statusMessage}"</p>
            )}
            <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-4 w-full">
              <p className="text-green-700 font-semibold text-center">
                ✓ LINE 綁定成功！
              </p>
              {user && (
                <p className="text-sm text-gray-600 text-center mt-2">
                  已綁定至 {user.email}
                </p>
              )}
            </div>
            <div className="flex gap-3 mt-6 w-full">
              <button
                onClick={handleUnbind}
                disabled={isLoading}
                className="flex-1 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors disabled:bg-gray-400"
              >
                解除綁定
              </button>
              <button
                onClick={handleLogout}
                className="flex-1 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
              >
                登出
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}