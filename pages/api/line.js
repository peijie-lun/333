import { Client } from '@line/bot-sdk';
import getRawBody from 'raw-body';

const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new Client(lineConfig);                                         

export const config = {
  api: {
    bodyParser: false, // 必須關閉，因為 LINE Webhook 需要原始 body 驗證
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  try {
    // ✅ 取得原始 body
    const bodyBuffer = await getRawBody(req);
    const body = bodyBuffer.toString();
    const events = JSON.parse(body).events;

    // 公共設施關鍵字
    const facilityKeywords = ['公共設施', '設施', '健身房', '游泳池', '會議室', '交誼廳'];

    for (const event of events) {
      if (event.type === 'message' && event.message.type === 'text') {
        const userText = event.message.text.trim();
        const replyToken = event.replyToken;

        // ✅ 如果包含公共設施關鍵字 → 顯示 Flex 卡片
        if (facilityKeywords.some(kw => userText.includes(kw))) {
          const bubbleMessage = {
            type: 'flex',
            altText: '公共設施資訊',
            contents: {
              type: 'bubble',
              hero: {
                type: 'image',
                url: 'https://example.com/facility.jpg', // 替換成實際圖片 URL
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

        // ✅ 否則 → 呼叫 LLM API 回覆純文字
        try {
          const response = await fetch('https://333-psi-seven.vercel.app/api/line', {
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