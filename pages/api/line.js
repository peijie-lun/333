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

        // ✅ 新增：社區公告 Flex Message 回覆
        if (userText === '社區公告') {
          const flexMessage = {
            type: 'flex',
            altText: '📢 社區公告：清潔日通知',
            contents: {
              type: 'bubble',
              hero: {
                type: 'image',
                url: 'https://i.imgur.com/your-image.jpg', // 可換成你社區的圖片
                size: 'full',
                aspectRatio: '20:13',
                aspectMode: 'cover'
              },
              body: {
                type: 'box',
                layout: 'vertical',
                spacing: 'md',
                contents: [
                  {
                    type: 'text',
                    text: '📢 社區清潔日通知',
                    weight: 'bold',
                    size: 'xl',
                    color: '#1DB446'
                  },
                  {
                    type: 'text',
                    text: '🗓️ 日期：2025/10/28\n🕒 時間：上午 9:00 - 12:00\n📍 地點：社區中庭',
                    wrap: true,
                    color: '#555555',
                    size: 'sm'
                  },
                  {
                    type: 'text',
                    text: '請住戶準時參與，共同維護社區環境。',
                    wrap: true,
                    margin: 'md'
                  }
                ]
              },
              footer: {
                type: 'box',
                layout: 'vertical',
                spacing: 'sm',
                contents: [
                  {
                    type: 'button',
                    style: 'primary',
                    color: '#1DB446',
                    action: {
                      type: 'uri',
                      label: '查看詳細公告',
                      uri: 'https://example.com/announcement'
                    }
                  }
                ]
              }
            }
          };

          await client.replyMessage(replyToken, flexMessage);
          continue; // 跳過後續 LLM 查詢
        }

        // ✅ 原本的 LLM 查詢邏輯
        let replyMessage = '';
        try {
          const response = await fetch('https://333-psi-seven.vercel.app/api/llm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: userText }),
          });

          const result = await response.json();
          replyMessage = typeof result.answer === 'string' && result.answer.trim()
            ? result.answer.trim()
            : '查詢失敗，請稍後再試。';
        } catch (err) {
          console.error('查詢 LLM API 失敗:', err);
          replyMessage = '查詢失敗，請稍後再試。';
        }

        if (typeof replyMessage === 'string' && replyMessage.trim() !== '' && replyToken) {
          try {
            await client.replyMessage(replyToken, {
              type: 'text',
              text: replyMessage,
            });
          } catch (err) {
            console.error('LINE 回覆訊息失敗:', err);
          }
        } else {
          console.warn('無效的 replyMessage 或 replyToken，略過回覆。', {
            replyMessage,
            replyToken,
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