import { Client } from '@line/bot-sdk';
import { createClient } from '@supabase/supabase-js';

const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new Client(lineConfig);

// ✅ Supabase 初始化
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
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

       

        // ✅ 查詢風景邏輯：從 Supabase 抓圖片
        if (userText.includes('風景')) {
          const { data: imageData, error } = await supabase
            .from('images')
            .select('url, description')
            .limit(5); // 可調整張數

          if (error || !imageData || imageData.length === 0) {
            await client.replyMessage(replyToken, {
              type: 'text',
              text: '目前沒有找到風景圖片，請稍後再試。',
            });
            continue;
          }

          const bubbles = imageData.map(img => ({ 
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
                  text: img.description || '風景圖片',
                  wrap: true,
                  size: 'md',
                  color: '#333333'
                }
              ]
            }
          }));

          const flexMessage = {
            type: 'flex',
            altText: '🏞️ 風景圖片',
            contents: {
              type: 'carousel',
              contents: bubbles
            }
          };

          await client.replyMessage(replyToken, flexMessage);
          continue;
        }

        // ✅ LLM 查詢邏輯（保留原本）
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