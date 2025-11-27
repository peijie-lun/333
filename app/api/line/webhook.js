import { createClient } from '@supabase/supabase-js';
import { Client } from '@line/bot-sdk';

export const runtime = 'nodejs';

// --- LINE Bot 設定 ---
const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};
const client = new Client(lineConfig);

// --- Supabase ---
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export async function POST(req) {
  try {
    const { events } = await req.json();

    for (const event of events) {
      console.log('Received event:', JSON.stringify(event, null, 2));

      if (event.source.type !== 'user') continue; // 只處理 user

      const userId = event.source.userId;

      // --- 取得 LINE 使用者資料 ---
      let profile;
      try {
        profile = await client.getProfile(userId);
        console.log('Profile:', profile);
      } catch (err) {
        console.error('LINE getProfile 失敗:', err);
        continue; // 無法抓到 profile 就跳過
      }

      // --- upsert 到 Supabase ---
      const { data, error } = await supabase.from('line_users').upsert([{
        line_user_id: userId,
        display_name: profile.displayName,
        avatar_url: profile.pictureUrl || '',
        status_message: profile.statusMessage || '',
        updated_at: new Date().toISOString()
      }], { onConflict: 'line_user_id' });

      console.log('Supabase upsert data:', data, 'error:', error);

      // --- follow 事件回覆歡迎訊息 ---
      if (event.type === 'follow') {
        try {
          await client.replyMessage(event.replyToken, {
            type: 'text',
            text: `歡迎加入 ${profile.displayName}！`
          });
        } catch (err) {
          console.error('LINE replyMessage 失敗:', err);
        }
      }

      // --- 可在這裡處理其他互動事件 ---
      if (event.type === 'message') {
        console.log(`使用者 ${profile.displayName} 發送訊息:`, event.message);
      }
      if (event.type === 'postback') {
        console.log(`使用者 ${profile.displayName} 按下按鈕:`, event.postback);
      }
    }

    return Response.json({ success: true });
  } catch (err) {
    console.error('LINE webhook POST 錯誤:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function GET() {
  return Response.json({ error: 'Method Not Allowed' }, { status: 405 });
}
