import { Client } from '@line/bot-sdk';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);
import { generateAnswer, getImageUrlsByKeyword } from '../../../grokmain.js';
import 'dotenv/config';

export const runtime = 'nodejs';

const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new Client(lineConfig);

const IMAGE_KEYWORDS = ['圖片', '設施', '游泳池', '健身房', '大廳'];

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
      // 取得 userId
      const userId = event.source?.userId;
      // 嘗試抓 LINE Profile
      let profile = { displayName: '', pictureUrl: '', statusMessage: '' };
      try {
        profile = await client.getProfile(userId);
      } catch (err) {
        console.warn('⚠️ 無法抓到 profile，只存 userId。', err);
      }

      // 檢查使用者是否已存在
      const { data: existingUser, error: checkError } = await supabase
        .from('line_users')
        .select('*')
        .eq('line_user_id', userId)
        .single();
      if (checkError && checkError.code !== 'PGRST116') {
        console.error('❌ Supabase 檢查錯誤:', checkError);
      }
      const isAlreadyBound = existingUser !== null;

      // follow 事件：新用戶
      if (event.type === 'follow') {
        if (!isAlreadyBound) {
          const { error } = await supabase.from('line_users').upsert(
            [
              {
                line_user_id: userId,
                display_name: profile.displayName || '',
                avatar_url: profile.pictureUrl || '',
                status_message: profile.statusMessage || '',
                updated_at: new Date().toISOString(),
              },
            ],
            { onConflict: 'line_user_id' }
          );
          if (error) console.error('❌ Supabase 寫入錯誤:', error);
        }
        continue;
      }

      // message 事件：有 profile 變動才更新
      if (event.type === 'message') {
        const profileChanged =
          !existingUser ||
          existingUser.display_name !== (profile.displayName || '') ||
          existingUser.avatar_url !== (profile.pictureUrl || '') ||
          existingUser.status_message !== (profile.statusMessage || '');
        if (profileChanged) {
          const { error: upsertError } = await supabase.from('line_users').upsert(
            [
              {
                line_user_id: userId,
                display_name: profile.displayName || '',
                avatar_url: profile.pictureUrl || '',
                status_message: profile.statusMessage || '',
                updated_at: new Date().toISOString(),
              },
            ],
            { onConflict: 'line_user_id' }
          );
          if (upsertError) console.error('❌ Supabase 寫入錯誤:', upsertError);
        }
      }
      if (event.type === 'message' && event.message.type === 'text') {
        const userText = event.message.text.trim();
        const replyToken = event.replyToken;

        console.log('使用者輸入:', userText);

        // 0️⃣ 投票訊息 → 呼叫 /api/votes 並直接回覆
        if (userText.startsWith('vote:')) {
          try {
            const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'https://your-domain.vercel.app'}/api/votes`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                vote_message: userText,
                line_user_id: userId
              })
            });
            const result = await response.json();
            const replyText = result.message || result.error || '投票處理完成';
            await client.replyMessage(replyToken, { type: 'text', text: replyText });
          } catch (err) {
            console.error('投票處理失敗:', err);
            await client.replyMessage(replyToken, { type: 'text', text: '投票失敗，請稍後再試' });
          }
          continue;
        }

        // 1️⃣ 公共設施 → 固定 Flex Message
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

        // 2️⃣ 圖片關鍵字 → 目前回覆暫時文字提示
        if (IMAGE_KEYWORDS.some(kw => userText.includes(kw))) {
          await client.replyMessage(replyToken, { type: 'text', text: '目前圖片查詢功能尚未啟用。' });
          continue;
        }

        // 3️⃣ 其他 → 呼叫 Groq LLM API（純 Node.js，不再用 Python）
        try {
          // 使用你原本 lib/grokmain.js 的 generateAnswer 函數
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
