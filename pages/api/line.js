import { Client } from '@line/bot-sdk';
import { createClient } from '@supabase/supabase-js';

const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,    
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new Client(lineConfig);

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

          const bubbles = images
            .filter(img => img.url && img.url.startsWith('https://'))
            .map(img => ({
              type: 'bubble',
              hero: {
                type: 'image',
                url: img.url,
                size: 'full',
                aspectRatio: '16:9',
                aspectMode: 'cover',
              },
              body: {
                type: 'box',
                layout: 'vertical',
                spacing: 'md',
                contents: [
                  {
                    type: 'text',
                    text: '社區圖片',
                    weight: 'bold',
                    size: 'lg',
                    wrap: true,
                    color: '#1DB446',
                  },
                  {
                    type: 'text',
                    text: img.description || '這是社區相關的圖片資訊。',
                    size: 'sm',
                    wrap: true,
                    color: '#555555',
                  },
                ],
              },
              footer: {
                type: 'box',
                layout: 'vertical',
                spacing: 'sm',
                contents: [
                  {
                    type: 'button',
                    style: 'link',
                    height: 'sm',
                    action: {
                      type: 'uri',
                      label: '查看原圖',
                      uri: img.url,
                    },
                  },
                ],
                flex: 0,
              },
            }));

          const messages = [];

          // 先回覆文字，再回覆圖片卡片（或依需求調整順序）
          messages.push({
            type: 'text',
            text: replyMessage,
          });

          if (bubbles.length > 0) {
            messages.push({
              type: 'flex',
              altText: '📷 查詢結果',
              contents: {
                type: 'carousel',
                contents: bubbles,
              },
            });
          }

          await client.replyMessage(replyToken, messages);
        } catch (err) {
          console.error('查詢 LLM API 或回覆失敗:', err);
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