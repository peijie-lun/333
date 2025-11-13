export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  try {
    const buffers = [];
    for await (const chunk of req) {
      buffers.push(chunk);
    }
    const body = Buffer.concat(buffers).toString();
    const events = JSON.parse(body).events;

    for (const event of events) {
      if (event.type === 'message' && event.message.type === 'text') {
        const userText = event.message.text.trim();
        const replyToken = event.replyToken;

        // ✅ 公共設施
        if (userText.includes('公共設施')) {
          // ... 回傳三張卡片
          await client.replyMessage(replyToken, carouselMessage);
          return res.status(200).end();
        }
        // ✅ 圖片
        else if (imageKeywords.some(kw => userText.includes(kw))) {
          // ... 查 Supabase 回傳圖片
          await client.replyMessage(replyToken, carouselMessage);
          return res.status(200).end();
        }
        // ✅ LLM
        else {
          // ... 呼叫 LLM API
          await client.replyMessage(replyToken, { type: 'text', text: replyMessage });
          return res.status(200).end();
        }
      }
    }

    res.status(200).end();
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).end();
  }
} 