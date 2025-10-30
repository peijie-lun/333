import { Client } from '@line/bot-sdk';
import { createClient } from '@supabase/supabase-js';

const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new Client(lineConfig);

// ✅ Supabase 初始化
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

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

    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';

    for (const event of events) {
      if (event.type === 'message' && event.message.type === 'text') {
        const userText = event.message.text.trim();
        const replyToken = event.replyToken;

        // ✅ 最新公告邏輯
        if (userText === '最新公告') {
          const flexMessage = {
            type: 'flex',
            altText: '📢 最新公告',
            contents: {
              type: 'bubble',
              hero: {
                type: 'image',
                url: 'https://example.com/announcement.jpg',
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
                    text: '📢 社區最新公告',
                    weight: 'bold',
                    size: 'lg',
                    color: '#1DB446'
                  },
                  {
                    type: 'text',
                    text: '請注意：11/1 起社區將進行電梯保養，請配合使用樓梯。',
                    wrap: true,
                    margin: 'md',
                    size: 'md',
                    color: '#333333'
                  }
                ]
              }
            }
          };

          await client.replyMessage(replyToken, flexMessage);
          continue;
        }

        // ✅ LLM 查詢邏輯（丟給 /api/llm）
        try {
          const response = await fetch(new URL('/api/llm', baseUrl), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: userText }),
          });

          if (!response.ok) {
            throw new Error(`LLM API 回傳錯誤: ${response.status}`);
          }

          const result = await response.json();
          const replyMessage = result.answer?.trim() || '目前沒有找到相關資訊，請查看社區公告。';
          const images = result.images || [];

          // ✅ 過濾無效圖片
          const bubbles = images
            .filter(img => img.url && img.url.startsWith('https://'))
            .map(img => ({
              type: 'bubble',
              hero: {
                type: 'image',
                url: img.url,
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

          let flexMessage;

          if (bubbles.length > 0) {
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

          // ✅ 加入 try/catch 防止 LINE API 回傳錯誤
          try {
            await client.replyMessage(replyToken, flexMessage);
          } catch (err) {
            console.error('回覆 LINE Flex Message 失敗:', err);
            await client.replyMessage(replyToken, {
              type: 'text',
              text: replyMessage || '查詢失敗，請稍後再試。',
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