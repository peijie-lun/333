
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

// --- Supabase ---
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export async function POST(req) {
  try {
    const body = await req.json();
    const { title, description, author, ends_at, options, test } = body;

    // 防呆：必填欄位
    if (!title || !author || !ends_at) {
      return Response.json(
        { error: 'title, author, ends_at 為必填' },
        { status: 400 }
      );
    }

    const time = new Date().toLocaleString('zh-TW', { hour12: false });

    // --- 測試模式 ---
    if (test === true) {
      return Response.json({ message: '投票測試成功' });
    }

    // --- 1. 儲存到 Supabase ---
    const { error } = await supabase
      .from('votes')
      .insert([
        {
          title,
          description,
          ends_at,
          author,
          options: options || ['同意', '反對', '棄權'],
          created_at: new Date().toISOString()
        }
      ]);

    if (error) {
      console.error('Supabase 插入錯誤:', error);
      return Response.json({ error }, { status: 500 });
    }

    // --- 2. 推播到 LINE ---
    const lineUserId = 'U5dbd8b5fb153630885b656bb5f8ae011'; // 固定推播到這個 ID

    const pushBody = {
      to: lineUserId,
      messages: [
        {
          type: 'text',
          text: `📢 新的投票\n標題：${title}\n說明：${description || '無'}\n截止時間：${ends_at}\n發布者：${author}\n時間：${time}`
        }
      ]
    };

    const lineRes = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`
      },
      body: JSON.stringify(pushBody)
    });

    if (!lineRes.ok) {
      const errText = await lineRes.text();
      console.error('LINE 推播失敗:', errText);
      return Response.json({ error: errText }, { status: 500 });
    }

    // --- 最終成功回應 ---
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
