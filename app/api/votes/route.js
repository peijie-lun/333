
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

    // ✅ 投票訊息處理
    if (body.vote_message && typeof body.vote_message === 'string') {
      const line_user_id = body.line_user_id;
      const replyToken = body.replyToken;

      // 解析 vote_message 格式：vote:{vote_id}:{option}
      const parts = body.vote_message.split(':');
      if (parts.length < 3) {
        return Response.json({ error: '投票訊息格式錯誤' }, { status: 400 });
      }
      const voteIdFromMsg = parts[1];
      const option_selected = parts[2].replace('🗳️', '').trim();

      // 查詢最新投票
      const { data: latestVote, error: voteError } = await supabase
        .from('votes')
        .select('id, ends_at')
        .order('created_at', { ascending: false })
        .limit(1);

      if (voteError || !latestVote || !latestVote[0]) {
        return Response.json({ error: '找不到進行中的投票' }, { status: 400 });
      }

      const vote_id = latestVote[0].id;

      // 檢查 voteId 是否一致
      if (voteIdFromMsg !== vote_id) {
        return Response.json({ error: '投票 ID 不一致' }, { status: 400 });
      }

      // 查詢 line_users，拿 profile_id
      const { data: userProfile, error: userError } = await supabase
        .from('line_users')
        .select('display_name, profile_id')
        .eq('line_user_id', line_user_id)
        .single();

      if (userError || !userProfile || !userProfile.profile_id) {
        return Response.json({ error: '找不到住戶資料或 profile_id 為空' }, { status: 400 });
      }

      const user_id = userProfile.profile_id;
      const user_name = userProfile.display_name;

      // ✅ 防止重複投票
      const { data: existingVote } = await supabase
        .from('vote_records')
        .select('id')
        .eq('vote_id', vote_id)
        .eq('user_id', user_id)
        .maybeSingle();

      if (existingVote) {
        return Response.json({ error: '您已經投過票，不能重複投票' }, { status: 400 });
      }

      // ✅ 寫入 vote_records
      const voteRecord = {
        vote_id,
        user_id,
        user_name,
        option_selected,
        voted_at: new Date().toISOString(),
      };

      const { error: recordError } = await supabase.from('vote_records').insert([voteRecord]);

      if (recordError) {
        console.error('投票寫入失敗:', recordError.message, '資料:', voteRecord);
        return Response.json({ error: '投票失敗', details: recordError.message }, { status: 500 });
      }

      console.log('✅ 投票成功:', voteRecord);

      // ✅ 回覆 LINE 使用者
      const replyText = `確認，您的投票結果為「${option_selected}」`;
      if (replyToken) {
        try {
          await client.replyMessage(replyToken, [{ type: 'text', text: replyText }]);
        } catch (e) {
          console.error('replyMessage 失敗:', e);
        }
      }

      return Response.json({ success: true, message: replyText });
    }

    // ✅ 管理者發布投票
    const { title, description, author, ends_at, options, test } = body;

    if (!title || !author || !ends_at) {
      return Response.json({ error: 'title, author, ends_at 為必填' }, { status: 400 });
    }

    if (test === true) {
      return Response.json({ message: '投票測試成功，未推播' });
    }

    const time = new Date().toLocaleString('zh-TW', { hour12: false });

    // ✅ 儲存投票
    const { data: voteInsert, error } = await supabase.from('votes').insert([{
      title,
      description,
      ends_at,
      author,
      options: options || ['同意', '反對', '棄權'],
      created_at: new Date().toISOString()
    }]).select();

    if (error || !voteInsert || !voteInsert[0]) {
      console.error('Supabase 插入錯誤:', error);
      return Response.json({ error }, { status: 500 });
    }

    const vote_id = voteInsert[0].id;
    const voteOptions = options || ['同意', '反對', '棄權'];

    // ✅ Flex Message
    const flexMessage = {
      type: 'flex',
      altText: '📢 新投票通知',
      contents: {
        type: 'bubble',
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'md',
          contents: [
            { type: 'text', text: '📢 新的投票', weight: 'bold', size: 'lg' },
            { type: 'separator', margin: 'md' },
            { type: 'text', text: `📌 標題：${title}`, wrap: true, weight: 'bold' },
            { type: 'text', text: `📝 說明：${description || '無'}`, wrap: true },
            { type: 'text', text: `⏰ 截止時間：${ends_at}`, color: '#aaaaaa', size: 'sm' },
            { type: 'text', text: `👤 發布者：${author}`, color: '#aaaaaa', size: 'sm' },
            { type: 'text', text: `🕒 時間：${time}`, color: '#aaaaaa', size: 'sm' },
          ],
        },
      },
      quickReply: {
        items: voteOptions.map(opt => ({
          type: 'action',
          action: {
            type: 'message',
            label: `🗳️ ${opt}`,
            text: `vote:${vote_id}:${opt} 🗳️`
          }
        }))
      }
    };

    await client.broadcast(flexMessage);
    return Response.json({ success: true });

  } catch (err) {
    console.error('votes POST 錯誤:', err);
    return Response.json({ error: 'Internal Server Error', details: err.message }, { status: 500 });
   }
}

export async function GET() {
  return Response.json({ error: 'Method Not Allowed' }, { status: 405 });
}
