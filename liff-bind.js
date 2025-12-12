import liff from "@line/liff";

async function main() {
  try {
    await liff.init({ liffId: "YOUR_LIFF_ID" });

    if (!liff.isLoggedIn()) {
      liff.login();
      return;
    }

    const profile = await liff.getProfile();

    const lineUserId = profile.userId;
    const displayName = profile.displayName;
    const avatarUrl = profile.pictureUrl;
    const statusMessage = profile.statusMessage;

    // send to backend
    await fetch("/api/bind-line", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lineUserId, displayName, avatarUrl, statusMessage })
    });

    document.body.innerHTML = `
      <h2>綁定成功！</h2>
      <p>感謝您綁定 LINE，之後可收到公告 / 管理費提醒。</p>
    `;
  } catch (err) {
    console.error(err);
    document.body.innerHTML = `<p>綁定失敗：${err.message}</p>`;
  }
}

main();
