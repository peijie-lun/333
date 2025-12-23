import { createClient } from '@supabase/supabase-js';
import { Client } from '@line/bot-sdk';

export const runtime = 'nodejs';

// --- LINE Bot ---
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
    const body = await req.json();
    console.log('📥 收到 POST 請求:', JSON.stringify(body, null, 2));

    // -----------------------------
    // ✅ 使用者投票處理
    // -----------------------------
    if (body.vote_message && typeof body.vote_message === 'string') {
      console.log('🗳️ 進入投票處理流程');
      const line_user_id = body.line_user_id;
      const replyToken = body.replyToken;

      const parts = body.vote_message.split(':');
      if (parts.length < 3) {
        return Response.json({ error: '投票訊息格式錯誤' }, { status: 400 });
      }

      let voteIdFromMsg = parts[1].trim();
      const option_selected = parts[2].replace('🗳️', '').trim();

      // 確認 vote_id 在 votes 表中存在
      const { data: voteExists } = await supabase
        .from('votes')
        .select('id')
        .eq('id', voteIdFromMsg)
        .single();

      if (!voteExists) {
        return Response.json({
          error: '投票已過期或不存在，請點擊最新投票訊息'
        }, { status: 400 });
      }

      const vote_id = voteExists.id;

      // 查詢使用者 profile_id
      const { data: userProfile, error: userError } = await supabase
        .from('line_users')
        .select('display_name, profile_id')
        .eq('line_user_id', line_user_id)
        .single();

      if (userError || !userProfile) {
        console.error('查詢 line_users 失敗:', userError);
        return Response.json({ error: '找不到住戶資料' }, { status: 400 });
      }

      if (!userProfile.profile_id) {
        console.error('profile_id 為空:', line_user_id);
        return Response.json({ error: 'profile_id 未設定，請聯絡管理員' }, { status: 400 });
      }

      const user_id = userProfile.profile_id;
      const user_name = userProfile.display_name;

      // 確認 profile_id 在 profiles 表中存在
      const { data: profileExists, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user_id)
        .single();

      if (profileError || !profileExists) {
        console.error('profiles 表中找不到 user_id:', user_id, profileError);
        return Response.json({ error: 'profile_id 無效，請聯絡管理員' }, { status: 400 });
      }

      // 防止重複投票
      const { data: existingVote } = await supabase
        .from('vote_records')
        .select('id')
        .eq('vote_id', vote_id)
        .eq('user_id', user_id)
        .maybeSingle();

      if (existingVote) {
        return Response.json({ error: '您已經投過票，不能重複投票' }, { status: 400 });
      }

      // 寫入 vote_records
      const voteRecord = {
        vote_id,
        user_id,
        user_name,
        option_selected,
        voted_at: new Date().toISOString(),
      };

      console.log('💾 準備寫入 vote_records:', voteRecord);
      const { error: recordError } = await supabase.from('vote_records').insert([voteRecord]);

      if (recordError) {
        console.error('❌ 投票寫入失敗:', recordError.message, recordError);
        return Response.json({ error: '投票失敗', details: recordError.message }, { status: 500 });
      }
      

      console.log('✅ 投票成功:', voteRecord);

      // 回覆 LINE 使用者（已在 webhook 端處理，這裡只回傳訊息）
      const replyText = `確認，您的投票結果為「${option_selected}」`;

      return Response.json({ success: true, message: replyText });
    }

    // -----------------------------
    // ✅ 管理者發布新問卷（純文字推播）
    // -----------------------------
    const { title, description, author, ends_at, form_url, test } = body;

    if (!title || !ends_at || !form_url) {
      return Response.json({ error: 'title, ends_at, form_url 為必填' }, { status: 400 });
    }

    if (test === true) {
      return Response.json({ message: '問卷測試成功，未推播' });
    }

    // 儲存問卷（可選，若有需要記錄）
    await supabase.from('votes').insert([{
      title,
      description: description || '',
      ends_at,
      form_url,
      author: author || '管理員',
      created_at: new Date().toISOString()
    }]);

    // 組合純文字訊息
    const text =
      `📢 新問卷通知\n` +
      `標題：${title}\n` +
      `截止時間：${ends_at}\n` +
      `請點擊下方連結填寫問卷：\n${form_url}`;

    // 推播給所有用戶
    await client.broadcast({
      type: 'text',
      text
    });
    return Response.json({ success: true });
  } catch (err) {
    console.error('votes POST 錯誤:', err);
    return Response.json({ error: 'Internal Server Error', details: err.message }, { status: 500 });
  }
}

export async function GET() {
  return Response.json({ error: 'Method Not Allowed' }, { status: 405 });
}