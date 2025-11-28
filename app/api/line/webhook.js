import { createClient } from '@supabase/supabase-js';
import { Client } from '@line/bot-sdk';

export const runtime = 'nodejs';

const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};
const client = new Client(lineConfig);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export async function POST(req) {
  try {
    const { events } = await req.json();

    for (const event of events) {
      const userId = event.source.userId;

      // 嘗試抓 LINE Profile
      let profile = { displayName: '', pictureUrl: '', statusMessage: '' };
      try {
        profile = await client.getProfile(userId);
      } catch (err) {
        console.warn('⚠️ 無法抓到 profile，只存 userId。', err);
      }

      // 檢查使用者是否已綁定
      const { data: existingUser, error: checkError } = await supabase
        .from('line_users')
        .select('*')
        .eq('line_user_id', userId)
        .single();

      if (checkError && checkError.code !== 'PGRST116') {
        console.error('❌ Supabase 檢查錯誤:', checkError);
      }

      const isAlreadyBound = existingUser !== null;

      // FOLLOW 事件 → 只存資料
      if (event.type === 'follow') {
        if (!isAlreadyBound) {
          const { error } = await supabase.from('line_users').upsert(
            [
              {
                line_user_id: userId,
                display_name: profile.displayName || '',
                avatar_url: profile.pictureUrl || '',
                status_message: profile.statusMessage || '',
              },
            ],
            { onConflict: 'line_user_id' }
          );
          if (error) console.error('❌ Supabase 寫入錯誤:', error);
        }
        continue;
      }

      // MESSAGE 事件 → 綁定或已綁定提醒
      if (event.type === 'message') {
        if (!isAlreadyBound) {
          // 尚未綁定 → 寫入資料庫
          const { error } = await supabase.from('line_users').upsert(
            [
              {
                line_user_id: userId,
                display_name: profile.displayName || '',
                avatar_url: profile.pictureUrl || '',
                status_message: profile.statusMessage || '',
              },
            ],
            { onConflict: 'line_user_id' }
          );
          if (error) console.error('❌ Supabase 寫入錯誤:', error);

          // 回覆綁定成功
          await client.replyMessage(event.replyToken, {
            type: 'text',
            text: `綁定完成！🎉\n歡迎你，${profile.displayName || '使用者'}！`
          });
        } else {
          // 已綁定 → 簡單提醒
          await client.replyMessage(event.replyToken, {
            type: 'text',
            text: `你已經完成綁定囉，${profile.displayName || '使用者'} 😊`
          });
        }
        continue;
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
