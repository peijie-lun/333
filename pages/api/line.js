import { Client } from '@line/bot-sdk';
import { getImageUrlsByKeyword } from '../../grokmain.js';

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

    const facilityKeywords = ['公共設施', '設施', '健身房', '游泳池', '會議室', '交誼廳'];
    const imageKeywords = ['圖片', '風景', '設施', '游泳池', '健身房', '大廳'];

    for (const event of events) {
      if (event.type === 'message' && event.message.type === 'text') {
        const userText = event.message.text.trim();
        const replyToken = event.replyToken;

        console.log('使用者輸入:', userText);

        // ✅ 先判斷圖片關鍵字 → 查 Supabase 並回傳圖片輪播
        if (imageKeywords.some(kw => userText.includes(kw))) {
          const imageData = await getImageUrlsByKeyword(userText);
          console.log('Supabase 查詢結果:', imageData);

          if (imageData.length === 0) {
            await client.replyMessage(replyToken, {
              type: 'text',
              text: '目前沒有找到相關圖片，請稍後再試。',
            });
            continue;
          }

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
          continue;
        }

        // ✅ 如果包含公共設施關鍵字 → 顯示固定輪播卡片
        if (facilityKeywords.some(kw => userText.includes(kw))) {
          const carouselMessage = {
            type: 'flex',
            altText: '公共設施資訊',
            contents: {
              type: 'carousel',
              contents: [
                {
                  type: 'bubble',
                  hero: {
                    type: 'image',
                    url: 'https://example.com/gym.jpg',
                    size: 'full',
                    aspectRatio: '20:13',
                    aspectMode: 'cover'
                  },
                  body: {
                    type: 'box',
                    layout: 'vertical',
                    contents: [
                      { type: 'text', text: '健身房\n開放時間：06:00 - 22:00', wrap: true }
                    ]
                  }
                },
                {
                  type: 'bubble',
                  hero: {
                    type: 'image',
                    url: 'https://example.com/pool.jpg',
                    size: 'full',
                    aspectRatio: '20:13',
                    aspectMode: 'cover'
                  },
                  body: {
                    type: 'box',
                    layout: 'vertical',
                    contents: [
                      { type: 'text', text: '游泳池\n開放時間：08:00 - 20:00', wrap: true }
                    ]
                  }
                },
                {
                  type: 'bubble',
                  hero: {
                    type: 'image',
                    url: 'https://example.com/lounge.jpg',
                    size: 'full',
                    aspectRatio: '20:13',
                    aspectMode: 'cover'
                  },
                  body: {
                    type: 'box',
                    layout: 'vertical',
                    contents: [
                      { type: 'text', text: '交誼廳\n開放時間：全天', wrap: true }
                    ]
                  }
                }
              ]
            }
          };

          await client.replyMessage(replyToken, carouselMessage);
          continue;
        }

        // ✅ 否則 → 呼叫 LLM API 回覆純文字
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
            continue;
          }

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