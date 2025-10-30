export async function POST(req) {
  const { title, time, location, note } = await req.json();
  
  // Basic validation
  if (!title && !time && !location && !note) {
    return new Response("缺少推播內容", { status: 400 })
  }

  if (!process.env.LINE_CHANNEL_ACCESS_TOKEN) {
    return new Response("LINE_CHANNEL_ACCESS_TOKEN not set in environment", { status: 500 })
  }

  const message = `新活動通知\n主題：${title}\n時間：${time}\n地點：${location}\n備註：${note || '無'}`;

  try {
    const res = await fetch("https://api.line.me/v2/bot/message/broadcast", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`
      },
      body: JSON.stringify({
        messages: [{ type: "text", text: message }]
      })
    });

    const text = await res.text().catch(() => "")

    if (!res.ok) {
      // Relay LINE API status and body to help debugging (don't include secrets)
      return new Response(`LINE API error ${res.status}: ${text}`, { status: 500 })
    }

    return new Response("推播成功", { status: 200 })
  } catch (err) {
    return new Response(`推播例外: ${err?.message || String(err)}`, { status: 500 })
  }
}
console.log("LINE TOKEN:", process.env.LINE_CHANNEL_ACCESS_TOKEN?.slice(0, 10) + "...");
