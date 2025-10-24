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

        // ✅ 使用者輸入「最新公告」時回覆輪播卡片
        if (userText === '最新公告') {
          const carouselMessage = {
            type: 'flex',
            altText: '📢 社區多則公告',
            contents: {
              type: 'carousel',
              contents: [
                {
                  type: 'bubble',
                  hero: {
                    type: 'image',
                    url: 'https://i.imgur.com/your-image1.jpg',
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
                        text: '📢 清潔日通知',
                        weight: 'bold',
                        size: 'xl',
                        color: '#1DB446'
                      },
                      {
                        type: 'text',
                        text: '🗓️ 2025/10/28\n🕒 上午 9:00 - 12:00\n📍 社區中庭',
                        wrap: true,
                        size: 'sm',
                        color: '#555555'
                      }
                    ]
                  },
                  footer: {
                    type: 'box',
                    layout: 'vertical',
                    contents: [
                      {
                        type: 'button',
                        style: 'primary',
                        action: {
                          type: 'uri',
                          label: '查看詳情',
                          uri: 'https://example.com/notice1'
                        }
                      }
                    ]
                  }
                },
                {
                  type: 'bubble',
                  hero: {
                    type: 'image',
                    url: 'https://i.imgur.com/your-image2.jpg',
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
                        text: '🎉 中秋晚會',
                        weight: 'bold',
                        size: 'xl',
                        color: '#FF6F00'
                      },
                      {
                        type: 'text',
                        text: '🗓️ 2025/10/30\n🕒 晚上 6:00\n📍 社區廣場',
                        wrap: true,
                        size: 'sm',
                        color: '#555555'
                      }
                    ]
                  },
                  footer: {
                    type: 'box',
                    layout: 'vertical',
                    contents: [
                      {
                        type: 'button',
                        style: 'primary',
                        action: {
                          type: 'uri',
                          label: '活動詳情',
                          uri: 'https://example.com/notice2'
                        }
                      }
                    ]
                  }
                }
              ]
            }
          };

          await client.replyMessage(replyToken, carouselMessage);
          continue;
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