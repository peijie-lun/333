import { Client } from '@line/bot-sdk';
import path from 'path';
import { exec } from 'child_process';
import { getImageUrlsByKeyword } from '../../../grokmain.js'; // 確認 ESM export
import { fetchData } from '../../../supabase_fetch.js'; // 若有其他函數也可以 import

const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new Client(lineConfig);

export async function POST(req) {
  try {
    const rawBody = await req.text();
    if (!rawBody) {
      console.error('Webhook error: Empty body');
      return new Response('Bad Request: Empty body', { status: 400 });
    }

    let events;
    try {
      const parsed = JSON.parse(rawBody);
      events = parsed.events;
    } catch (err) {
      console.error('Webhook error: Invalid JSON', err);
      return new Response('Bad Request: Invalid JSON', { status: 400 });
    }

    const imageKeywords = ['圖片', '設施', '游泳池', '健身房', '大廳'];

    for (const event of events) {
      if (event.type === 'message' && event.message.type === 'text') {
        const userText = event.message.text.trim();
        const replyToken = event.replyToken;

        console.log('使用者輸入:', userText);

        // 1️⃣ 公共設施
        if (userText.includes('公共設施')) {
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
                    url: 'https://today-obs.line-scdn.net/0h-NdfKUUZcmFZH1sCDogNNmNJcQ5qc2FiPSkjYhpxLFUjLjAzNSs8D3pKfgZ1KTU_Ny44D34WaVAmKjQ-ZSo8/w1200',
                    size: 'full',
                    aspectRatio: '20:13',
                    aspectMode: 'cover'
                  },
                  body: {
                    type: 'box',
                    layout: 'vertical',
                    contents: [{ type: 'text', text: '健身房\n開放時間：06:00 - 22:00', wrap: true }]
                  }
                },
                {
                  type: 'bubble',
                  hero: {
                    type: 'image',
                    url: 'https://www.ytyut.com/uploads/news/1000/3/d3156e6f-9126-46cd.jpg',
                    size: 'full',
                    aspectRatio: '20:13',
                    aspectMode: 'cover'
                  },
                  body: {
                    type: 'box',
                    layout: 'vertical',
                    contents: [{ type: 'text', text: '游泳池\n開放時間：08:00 - 20:00', wrap: true }]
                  }
                },
                {
                  type: 'bubble',
                  hero: {
                    type: 'image',
                    url: 'https://www.gogo-engineering.com/store_image/ydplan/file/D1695800312494.jpg',
                    size: 'full',
                    aspectRatio: '20:13',
                    aspectMode: 'cover'
                  },
                  body: {
                    type: 'box',
                    layout: 'vertical',
                    contents: [{ type: 'text', text: '大廳\n開放時間：全天', wrap: true }]
                  }
                }
              ]
            }
          };

          await client.replyMessage(replyToken, carouselMessage);
          continue;
        }

        // 2️⃣ 圖片關鍵字 → Supabase 查詢
        if (imageKeywords.some(kw => userText.includes(kw))) {
          const imageData = await getImageUrlsByKeyword(userText);
          console.log('Supabase 查詢結果:', imageData);

          if (!imageData || imageData.length === 0) {
            await client.replyMessage(replyToken, { type: 'text', text: '目前沒有找到相關圖片，請稍後再試。' });
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
                    contents: [{ type: 'text', text: item.description || '圖片', wrap: true }]
                  }
                }))
              }
            };

            await client.replyMessage(replyToken, carouselMessage);
          }
          continue;
        }

        // 3️⃣ 其他 → 呼叫 LLM API
        try {
          const response = await fetch('https://333-psi-seven.vercel.app/api/llm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: userText })
          });

          if (!response.ok) {
            console.error('LLM API 回傳錯誤:', await response.text());
            await client.replyMessage(replyToken, { type: 'text', text: '查詢失敗，請稍後再試。' });
          } else {
            const result = await response.json();
            const replyMessage = result.answer?.trim() || '目前沒有找到相關資訊，請查看社區公告。';
            await client.replyMessage(replyToken, { type: 'text', text: replyMessage });
          }
        } catch (err) {
          console.error('查詢 LLM API 失敗:', err);
          await client.replyMessage(replyToken, { type: 'text', text: '查詢失敗，請稍後再試。' });
        }

        // 4️⃣ 可選：呼叫 Python embedding
        const pythonPath = path.resolve('./embedding.py');
        exec(`python ${pythonPath}`, (err, stdout, stderr) => {
          if (err) console.error('Python embedding 執行失敗:', err);
          if (stdout) console.log('Python embedding output:', stdout);
          if (stderr) console.error('Python embedding stderr:', stderr);
        });
      }
    }

    return new Response('OK', { status: 200 });
  } catch (err) {
    console.error('Webhook error:', err);
    return new Response('Internal Server Error', { status: 500 });
  }
}

// GET 方法回傳 405
export async function GET(req) {
  return new Response('Method Not Allowed', { status: 405 });
}
