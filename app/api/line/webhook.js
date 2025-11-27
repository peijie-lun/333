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
      // --- 只處理 follow 與 message 事件 ---
      if (event.type === 'follow' || event.type === 'message') {
        const userId = event.source.userId;

        // 取得 LINE 使用者資料
        const profile = await client.getProfile(userId);

        // --- upsert 到 Supabase ---
        await supabase.from('line_users').upsert([{
          line_user_id: userId,
          display_name: profile.displayName,
          avatar_url: profile.pictureUrl || '',
          status_message: profile.statusMessage || ''
        }], { onConflict: 'line_user_id' });

        // --- 只在 follow 時回覆歡迎訊息 ---
        if (event.type === 'follow') {
          await client.replyMessage(event.replyToken, {
            type: 'text',
            text: `歡迎加入 ${profile.displayName}！`
          });
        }
      }
    }

    return Response.json({ success: true });

  } catch (err) {
    console.error('LINE webhook 錯誤:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function GET() {
  return Response.json({ error: 'Method Not Allowed' }, { status: 405 });
}
