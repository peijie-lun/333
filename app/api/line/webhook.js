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
    // 測試 Supabase 寫入
    const testUserId = 'test_user_' + Math.floor(Math.random() * 100000);
    const { error: testError } = await supabase.from('line_users').insert([
      {
        line_user_id: testUserId,
        display_name: '測試用',
        avatar_url: 'https://example.com/avatar.png',
        status_message: '測試訊息',
        updated_at: new Date().toISOString(),
      },
    ]);
    if (testError) {
      console.error('❌ Supabase 測試寫入失敗:', testError);
    } else {
      console.log('✅ Supabase 測試寫入成功，userId:', testUserId);
    }

    const { events } = await req.json();

    for (const event of events) {
      const userId = event.source.userId;
      console.log('收到 event:', event);
      console.log('userId:', userId);

      // 嘗試抓 LINE Profile
      let profile = { displayName: '', pictureUrl: '', statusMessage: '' };
      try {
        profile = await client.getProfile(userId);
        console.log('取得 LINE profile:', profile);
      } catch (err) {
        console.warn('⚠️ 無法抓到 profile，只存 userId。', err);
      }

      // 檢查使用者是否已綁定
      const { data: existingUser, error: checkError } = await supabase
        .from('line_users')
        .select('*')
        .eq('line_user_id', userId)
        .single();
      console.log('Supabase 查詢結果 existingUser:', existingUser);

      if (checkError && checkError.code !== 'PGRST116') {
        console.error('❌ Supabase 檢查錯誤:', checkError);
      }

      const isAlreadyBound = existingUser !== null;

      // FOLLOW 事件 → 只存資料
      if (event.type === 'follow') {
        if (!isAlreadyBound) {
          console.log('FOLLOW event: 新增使用者');
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
          else console.log('Supabase 寫入成功');
        }
        continue;
      }

      // MESSAGE 事件 → 綁定或已綁定提醒
      if (event.type === 'message') {
        // 只有 profile 有變動才 upsert
        const profileChanged =
          !existingUser ||
          existingUser.display_name !== (profile.displayName || '') ||
          existingUser.avatar_url !== (profile.pictureUrl || '') ||
          existingUser.status_message !== (profile.statusMessage || '');
        console.log('profileChanged:', profileChanged);

        if (profileChanged) {
          console.log('MESSAGE event: profile 有變動，更新使用者');
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
          else console.log('Supabase 寫入成功');
        } else {
          console.log('MESSAGE event: profile 無變動，不更新');
        }

        // 回覆訊息（可依原本邏輯）
        if (!isAlreadyBound) {
          await client.replyMessage(event.replyToken, {
            type: 'text',
            text: `綁定完成！🎉\n歡迎你，${profile.displayName || '使用者'}！`
          });
        } else {
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
