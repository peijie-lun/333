import { Client } from '@line/bot-sdk';

const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new Client(lineConfig);

export const config = {
  api: {
    bodyParser: false,
  },
};

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

    // 公共設施關鍵字
    const facilityKeywords = ['公共設施', '設施', '健身房', '游泳池', '會議室', '交誼廳'];

    for (const event of events) {
      if (event.type === 'message' && event.message.type === 'text') {
        const userText = event.message.text.trim();
        const replyToken = event.replyToken;

        // ✅ 如果包含公共設施關鍵字 → 顯示卡片
        if (facilityKeywords.some(kw => userText.includes(kw))) {
          const bubbleMessage = {
            type: 'flex',
            altText: '公共設施資訊',
            contents: {
              type: 'bubble',
              hero: {
                type: 'image',
                url: 'https://example.com/facility.jpg', // 替換成實際圖片
                size: 'full',
                aspectRatio: '20:13',
                aspectMode: 'cover'
              },
              body: {
                type: 'box',
                layout: 'vertical',
                contents: [
                  {
                    type: 'text',
                    text: '健身房開放時間：06:00 - 22:00\n請遵守使用規範。',
                    wrap: true
                  }
                ]
              }
            }
          };

          await client.replyMessage(replyToken, bubbleMessage);
          continue;
        }

        // ✅ 否則 → 呼叫 llm.js 回覆純文字
        try {
          const response = await fetch('https://your-vercel-app.vercel.app/api/llm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: userText }),
          });

          const result = await response.json();
          const replyMessage = result.answer?.trim() || '目前沒有找到相關資訊，請查看社區公告。';

          await client.replyMessage(replyToken, {
            type: 'text',
            text: replyMessage
          });
        } catch (err) {
          console.error('查詢 LLM API 失敗:', err);
          await client.replyMessage(replyToken, {
            type: 'text',
            text: '查詢失敗，請稍後再試。',
          });
        }
      }
    }

    res.status(200).end();
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).end();
  }
}