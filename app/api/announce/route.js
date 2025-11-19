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
    const { title, content, author, test } = body;

    // 防呆：必填欄位
    if (!title || !content || !author) {
      return Response.json(
        { error: 'title, content, author 為必填' },
        { status: 400 }
      );
    }

    const time = new Date().toLocaleString('zh-TW', { hour12: false });

    // --- 測試模式 ---
    if (test === true) {
      return Response.json({ message: '測試成功' });
    }

    // --- 1. 儲存到 Supabase ---
    const { error } = await supabase
      .from('announcements')
      .insert([{ title, content, time, author, reads: 0 }]);

    if (error) {
      console.error('Supabase 插入錯誤:', error);
      return Response.json({ error }, { status: 500 });
    }

    // --- 2. 推播到 LINE ---
    const lineUserId = 'U5dbd8b5fb153630885b656bb5f8ae011'; // 之後可改成動態

    const pushBody = {
      to: lineUserId,
      messages: [
        {
          type: 'text',
          text: `📢 最新公告\n${title}\n${content}\n發布者：${author}\n時間：${time}`,
        },
      ],
    };

    const lineRes = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify(pushBody),
    });

    if (!lineRes.ok) {
      const errText = await lineRes.text();
      console.error('LINE 推播失敗:', errText);
      return Response.json({ error: errText }, { status: 500 });
    }

    // --- 最終成功回應 ---
    return Response.json({ success: true });

  } catch (err) {
    console.error('announce POST 錯誤:', err);
    return Response.json(
      { error: 'Internal Server Error', details: err.message },
      { status: 500 }
    );
  }
}

export async function GET() {
  return Response.json({ error: 'Method Not Allowed' }, { status: 405 });
}
