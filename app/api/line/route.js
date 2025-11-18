import { Client } from '@line/bot-sdk';
import { getImageUrlsByKeyword } from '@/grokmain.js'; // 確認路徑正確

const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new Client(lineConfig);

// ✅ App Router 不需要 bodyParser 設定，直接處理 Request
export async function POST(req) {
  try {
    const rawBody = await req.text(); // 讀取原始 body
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

        // ✅ 1. 公共設施 → 回傳固定卡片
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
                    contents: [
                      { type: 'text', text: '健身房\n開放時間：06:00 - 22:00', wrap: true }
                    ]
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
                    contents: [
                      { type: 'text', text: '游泳池\n開放時間：08:00 - 20:00', wrap: true }
                    ]
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
                    contents: [
                      { type: 'text', text: '大廳\n開放時間：全天', wrap: true }
                    ]
                  }
                }
              ]
            }
          };

          await client.replyMessage(replyToken, carouselMessage);
          continue;
        }

        // ✅ 2. 圖片關鍵字 → 查 Supabase
        else if (imageKeywords.some(kw => userText.includes(kw))) {
          const imageData = await getImageUrlsByKeyword(userText);
          console.log('Supabase 查詢結果:', imageData);

          if (imageData.length === 0) {
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

    return new Response('OK', { status: 200 });
  } catch (err) {
    console.error('Webhook error:', err);
    return new Response('Internal Server Error', { status: 500 });
  }
}