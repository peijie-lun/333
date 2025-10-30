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

        // ✅ 最新公告邏輯不變
        if (userText === '最新公告') {
          // ...原 Flex Message 輪播卡片略
          continue;
        }

        // ✅ LLM 查詢邏輯
        try {
          const response = await fetch('https://333-psi-seven.vercel.app/api/llm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: userText }),
          });

          const result = await response.json();
          const replyMessage = result.answer?.trim() || '查詢失敗，請稍後再試。';
          const imageUrl = result.image?.trim();

          if (imageUrl) {
            const bubbleMessage = {
              type: 'flex',
              altText: '📷 查詢結果圖片',
              contents: {
                type: 'bubble',
                hero: {
                  type: 'image',
                  url: imageUrl,
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
                      text: replyMessage,
                      wrap: true,
                      size: 'md',
                      color: '#333333'
                    }
                  ]
                }
              }
            };

            await client.replyMessage(replyToken, bubbleMessage);
          } else {
            await client.replyMessage(replyToken, {
              type: 'text',
              text: replyMessage,
            });
          }
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