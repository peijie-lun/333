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

      // FOLLOW 事件：提醒使用者傳任何訊息
      if (event.type === 'follow') {
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: `歡迎加入！🙌\n請傳任意訊息以完成綁定。`
        });
        continue;
      }

      // MESSAGE 事件：使用者傳訊息 → 觸發綁定流程
      if (event.type === 'message') {
        // 讀取 LINE 用戶資料
        let profile = { displayName: '', pictureUrl: '', statusMessage: '' };
        try {
          profile = await client.getProfile(userId);
        } catch (err) {
          console.warn('⚠️ 無法抓到 profile，只存 userId。', err);
        }

        // 寫入 Supabase
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

        // 回覆綁定成功訊息
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: `綁定完成！🎉\n歡迎你，${profile.displayName || '使用者'}！`
        });

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
