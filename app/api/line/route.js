import { Client } from '@line/bot-sdk';
import { getImageUrlsByKeyword, generateAnswer } from '../../../lib/grokmain.js';
import { IMAGE_KEYWORDS } from '../../../utils/keywords.js';
import { facilityCarousel, buildImageCarousel } from '../../../utils/lineMessage.js';

// ✅ 強制使用 Node.js Runtime
export const runtime = 'nodejs';

// 初始化 LINE Bot
const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};
const client = new Client(lineConfig);

export async function POST(req) {
  try {
    const rawBody = await req.text();
    if (!rawBody) return new Response('Bad Request: Empty body', { status: 400 });

    let events;
    try {
      events = JSON.parse(rawBody).events;
    } catch {
      return new Response('Bad Request: Invalid JSON', { status: 400 });
    }

    for (const event of events) {
      if (event.type === 'message' && event.message.type === 'text') {
        const userText = event.message.text.trim();
        const replyToken = event.replyToken;

        console.log('使用者輸入:', userText);

        // ✅ 1. 公共設施 → 固定 Flex Message
        if (userText.includes('公共設施')) {
          const carouselMessage = facilityCarousel();
          await client.replyMessage(replyToken, carouselMessage);
          continue;
        }

        // ✅ 2. 圖片關鍵字 → Supabase 查詢
        if (IMAGE_KEYWORDS.some(kw => userText.includes(kw))) {
          const imageData = await getImageUrlsByKeyword(userText);
          console.log('Supabase 查詢結果:', imageData);

          if (!imageData || imageData.length === 0) {
            await client.replyMessage(replyToken, { type: 'text', text: '目前沒有找到相關圖片，請稍後再試。' });
          } else {
            const carouselMessage = buildImageCarousel(imageData);
            await client.replyMessage(replyToken, carouselMessage);
          }
          continue;
        }

        // ✅ 3. 其他 → 呼叫 LLM API (Groq)
        try {
          const answer = await generateAnswer(userText);
          const replyMessage = answer?.trim() || '目前沒有找到相關資訊，請查看社區公告。';
          await client.replyMessage(replyToken, { type: 'text', text: replyMessage });
        } catch (err) {
          console.error('查詢 LLM API 失敗:', err);
          await client.replyMessage(replyToken, { type: 'text', text: '查詢失敗，請稍後再試。' });
        }
      }
    }

    return new Response('OK', { status: 200 });
  } catch (err) {
    console.error('Webhook error:', err);
    return new Response('Internal Server Error', { status: 500 });
  }
}

export async function GET() {
  return new Response('Method Not Allowed', { status: 405 });
}
