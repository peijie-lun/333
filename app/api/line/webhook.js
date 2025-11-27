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
      if (event.source.type !== 'user') continue; // 只處理 user 來源

      const userId = event.source.userId;
      const profile = await client.getProfile(userId);

      // --- 查資料庫是否已存在 ---
      const { data: existing } = await supabase
        .from('line_users')
        .select('line_user_id')
        .eq('line_user_id', userId)
        .limit(1)
        .single();

      if (!existing) {
        // --- 不存在就新增 ---
        await supabase.from('line_users').insert([{
          line_user_id: userId,
          display_name: profile.displayName,
          avatar_url: profile.pictureUrl || '',
          status_message: profile.statusMessage || ''
        }]);
      } else {
        // --- 已存在就更新資料 ---
        await supabase.from('line_users').update({
          display_name: profile.displayName,
          avatar_url: profile.pictureUrl || '',
          status_message: profile.statusMessage || '',
          updated_at: new Date().toISOString()
        }).eq('line_user_id', userId);
      }

      // --- follow 事件才回覆歡迎訊息 ---
      if (event.type === 'follow') {
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: `歡迎加入 ${profile.displayName}！`
        });
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
