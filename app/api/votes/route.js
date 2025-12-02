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

    // --- 住戶投票訊息格式：只回選項文字 ---
    if (body.vote_message && typeof body.vote_message === 'string') {
      // 取得最新一筆投票（假設同時只會有一個進行中的投票）
      const { data: latestVote, error: voteError } = await supabase
        .from('votes')
        .select('id, ends_at')
        .order('created_at', { ascending: false })
        .limit(1);
      if (voteError || !latestVote || !latestVote[0]) {
        return Response.json({ error: '找不到進行中的投票。' }, { status: 400 });
      }
      const vote_id = latestVote[0].id;
      const option_selected = body.vote_message.trim();
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
      const user_id = userProfile.line_user_id;
      const user_name = userProfile.display_name;

      // 寫入 vote_records，並加強 debug log
      const voteRecord = {
        vote_id,
        user_id,
        user_name,
        option_selected,
        voted_at: new Date().toISOString(),
      };
      const { error: recordError } = await supabase.from('vote_records').insert([voteRecord]);
      if (recordError) {
        console.error('投票寫入失敗:', recordError, '資料:', voteRecord);
        return Response.json({ error: '投票失敗，請稍後再試。', details: recordError }, { status: 500 });
      }
      console.log('投票成功寫入 vote_records:', voteRecord);
      // 美化自動回覆內容
      const replyText = `✅ 投票成功！\n您已選擇「${option_selected}」\n感謝您的參與。`;
        // 直接用 LINE Bot replyMessage 主動回覆住戶
        if (body.replyToken) {
          try {
            await client.replyMessage(body.replyToken, [{ type: 'text', text: replyText }]);
          } catch (e) {
            console.error('replyMessage 失敗:', e);
          }
        }
      return Response.json({ success: true, message: replyText });
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

    // --- 2. Flex Message + Quick Reply 投票按鈕（只顯示選項文字） ---
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
            text: opt
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
