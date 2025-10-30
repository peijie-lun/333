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

    for (const event of events) {
      if (event.type === 'message' && event.message.type === 'text') {
        const userText = event.message.text.trim();
        const replyToken = event.replyToken;

        // ✅ 最新公告邏輯（略）
        if (userText === '最新公告') {
          await client.replyMessage(replyToken, {
            type: 'text',
            text: '這裡是最新公告，請稍後補上 Flex Message。',
          });
          continue;
        }

        // ✅ LLM 查詢邏輯（相對路徑）
        try {
          const response = await fetch(`${req.headers.origin || ''}/api/llm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: userText }),
          });

          const result = await response.json();
          const replyMessage = result.answer?.trim() || '目前沒有找到相關資訊，請查看社區公告。';
          const images = result.images || [];

          let flexMessage;

          if (images.length > 0) {
            const bubbles = images.map(img => ({
              type: 'bubble',
              hero: {
                type: 'image',
                url: img.url || 'https://example.com/default.jpg',
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
                    text: img.description || '社區圖片',
                    wrap: true,
                    size: 'md',
                    color: '#333333'
                  }
                ]
              }
            }));

            flexMessage = {
              type: 'flex',
              altText: '📷 查詢結果',
              contents: {
                type: 'carousel',
                contents: bubbles
              }
            };
          } else {
            flexMessage = {
              type: 'text',
              text: replyMessage
            };
          }

          await client.replyMessage(replyToken, flexMessage);
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