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

    // --- 住戶投票訊息格式：vote:{vote_id}:{option} ---
    if (body.vote_message && typeof body.vote_message === 'string' && body.vote_message.startsWith('vote:')) {
      // 解析 vote_id 與 option
      const match = body.vote_message.match(/^vote:([\w-]+):(.+)$/);
      if (!match) {
        return Response.json({ error: '投票格式錯誤，請重新操作。' }, { status: 400 });
      }
      const vote_id = match[1];
      const option_selected = match[2];
      const line_user_id = body.line_user_id;

      // 查詢 user profile
      const { data: userProfile, error: userError } = await supabase
        .from('line_users')
        .select('line_user_id, display_name')
        .eq('line_user_id', line_user_id)
        .single();
      if (userError || !userProfile) {
        return Response.json({ error: '找不到住戶資料，請聯絡管理員。' }, { status: 400 });
      }
      // TODO: 取得 user_id（UUID），這裡假設 line_users 有 user_id 欄位
      // const user_id = userProfile.user_id;
      // 若無 user_id，請根據 line_user_id 去 profiles 表查 user_id
      // 這裡暫用 line_user_id 當 user_id（請依實際結構調整）
      const user_id = userProfile.line_user_id;
      const user_name = userProfile.display_name;

      // 寫入 vote_records
      const { error: voteError } = await supabase.from('vote_records').insert([
        {
          vote_id,
          user_id,
          user_name,
          option_selected,
          voted_at: new Date().toISOString(),
        },
      ]);
      if (voteError) {
        return Response.json({ error: '投票失敗，請稍後再試。' }, { status: 500 });
      }
      return Response.json({ success: true, message: `投票成功！您選擇了「${option_selected}」` });
    }

    // --- 原本管理者發布投票推播功能 ---
    const { title, description, author, ends_at, options, test } = body;

    // --- 必填檢查 ---
    if (!title || !author || !ends_at) {
      return Response.json(
        { error: 'title, author, ends_at 為必填' },
        { status: 400 }
      );
    }

    const time = new Date().toLocaleString('zh-TW', { hour12: false });

    // --- 測試模式 ---
    if (test === true) {
      return Response.json({ message: '投票測試成功，未推播' });
    }


    // --- 1. 儲存至 Supabase ---
    const { data: voteInsert, error } = await supabase.from('votes').insert([
      {
        title,
        description,
        ends_at,
        author,
        options: options || ['同意', '反對', '棄權'],
        created_at: new Date().toISOString()
      }
    ]).select();

    if (error || !voteInsert || !voteInsert[0]) {
      console.error('Supabase 插入錯誤:', error);
      return Response.json({ error }, { status: 500 });
    }

    // 取得 vote_id
    const vote_id = voteInsert[0].id;
    const voteOptions = options || ['同意', '反對', '棄權'];

    // --- 2. Flex Message + Quick Reply 投票按鈕 ---
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
            {
              type: 'text',
              text: '📢 新的投票',
              weight: 'bold',
              size: 'lg',
            },
            { type: 'separator', margin: 'md' },
            {
              type: 'text',
              text: `📌 標題：${title}`,
              wrap: true,
              weight: 'bold',
            },
            {
              type: 'text',
              text: `📝 說明：${description || '無'}`,
              wrap: true,
            },
            {
              type: 'text',
              text: `⏰ 截止時間：${ends_at}`,
              color: '#aaaaaa',
              size: 'sm',
            },
            {
              type: 'text',
              text: `👤 發布者：${author}`,
              color: '#aaaaaa',
              size: 'sm',
            },
            {
              type: 'text',
              text: `🕒 時間：${time}`,
              color: '#aaaaaa',
              size: 'sm',
            },
          ],
        },
      },
      quickReply: {
        items: voteOptions.map(opt => ({
          type: 'action',
          action: {
            type: 'message',
            label: opt,
            text: `vote:${vote_id}:${opt}`
          }
        }))
      }
    };

    // --- 3. 推播給所有 LINE 好友 ---
    await client.broadcast(flexMessage);

    // --- 成功回應 ---
    return Response.json({ success: true });

  } catch (err) {
    console.error('votes POST 錯誤:', err);
    return Response.json(
      { error: 'Internal Server Error', details: err.message },
      { status: 500 }
    );
  }
}

export async function GET() {
  return Response.json({ error: 'Method Not Allowed' }, { status: 405 });
}
