import { Client } from '@line/bot-sdk';
import { createClient } from '@supabase/supabase-js';

const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new Client(lineConfig);

// ✅ Supabase 初始化
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export const config = {
  api: {
    bodyParser: false,
  },
};

// ✅ 查詢圖片資料
async function getImageUrlsByKeyword(keyword) {
  const { data, error } = await supabase
    .from('image')
    .select('url, description')
    .ilike('description', `%${keyword}%`); // 用 description 模糊搜尋

  if (error) {
    console.error('Supabase 查詢錯誤:', error);
    return [];
  }

  return data || [];
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  try {
    // ✅ 讀取原始 body
    const buffers = [];
    for await (const chunk of req) {
      buffers.push(chunk);
    }
    const rawBody = Buffer.concat(buffers).toString();

    if (!rawBody) {
      console.error('Webhook error: Empty body');
      res.status(400).send('Bad Request: Empty body');
      return;
    }

    let events;
    try {
      const parsed = JSON.parse(rawBody);
      events = parsed.events;
    } catch (err) {
      console.error('Webhook error: Invalid JSON', err);
      res.status(400).send('Bad Request: Invalid JSON');
      return;
    }

    const imageKeywords = ['圖片', '設施', '游泳池', '健身房', '大廳'];

    for (const event of events) {
      if (event.type === 'message' && event.message.type === 'text') {
        const userText = event.message.text.trim();
        const replyToken = event.replyToken;

        console.log('使用者輸入:', userText);

        // ✅ 1. 公共設施 → 從 Supabase 抓取圖片
        if (userText.includes('公共設施')) {
          const imageData = await getImageUrlsByKeyword('公共設施');

          if (!imageData || imageData.length === 0) {
            await client.replyMessage(replyToken, {
              type: 'text',
              text: '目前沒有找到公共設施圖片，請稍後再試。',
            });
            continue;
          }

          const carouselMessage = {
            type: 'flex',
            altText: '公共設施資訊',
            contents: {
              type: 'carousel',
              contents: imageData.map(item => ({
                type: 'bubble',
                hero: {
                  type: 'image',
                  url: item.url,
                  size: 'full',
                  aspectRatio: '20:13',
                  aspectMode: 'cover'
                },
                body: {
                  type: 'box',
                  layout: 'vertical',
                  contents: [
                    { type: 'text', text: item.description || '公共設施', wrap: true }
                  ]
                }
              }))
            }
          };

          await client.replyMessage(replyToken, carouselMessage);
          continue;
        }

        // ✅ 2. 圖片關鍵字 → 查 Supabase
        else if (imageKeywords.some(kw => userText.includes(kw))) {
          const imageData = await getImageUrlsByKeyword(userText);

          if (!imageData || imageData.length === 0) {
            await client.replyMessage(replyToken, {
              type: 'text',
              text: '目前沒有找到相關圖片，請稍後再試。',
            });
          } else {
            const carouselMessage = {
              type: 'flex',
              altText: '圖片資訊',
              contents: {
                type: 'carousel',
                contents: imageData.map(item => ({
                  type: 'bubble',
                  hero: {
                    type: 'image',
                    url: item.url,
                    size: 'full',
                    aspectRatio: '20:13',
                    aspectMode: 'cover'
                  },
                  body: {
                    type: 'box',
                    layout: 'vertical',
                    contents: [
                      { type: 'text', text: item.description || '圖片', wrap: true }
                    ]
                  }
                }))
              }
            };

            await client.replyMessage(replyToken, carouselMessage);
          }
          continue;
        }

        // ✅ 3. 其他 → 呼叫 LLM API
        else {
          try {
            const response = await fetch('https://333-psi-seven.vercel.app/api/llm', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ query: userText }),
            });

            if (!response.ok) {
              console.error('LLM API 回傳錯誤:', await response.text());
              await client.replyMessage(replyToken, {
                type: 'text',
                text: '查詢失敗，請稍後再試。',
              });
            } else {
              const result = await response.json();
              const replyMessage = result.answer?.trim() || '目前沒有找到相關資訊，請查看社區公告。';

              await client.replyMessage(replyToken, {
                type: 'text',
                text: replyMessage
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
    }

    res.status(200).end();
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).end();
  }
}