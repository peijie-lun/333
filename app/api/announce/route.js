import { createClient } from '@supabase/supabase-js';
import { Client } from '@line/bot-sdk';

// ✅ 強制使用 Node.js Runtime
export const runtime = 'nodejs';

// 初始化 LINE Bot
const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};
const client = new Client(lineConfig);

// 初始化 Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export async function POST(req) {
  try {
    const { title, content, author, test } = await req.json();
    const time = new Date().toLocaleString('zh-TW', { hour12: false });

    // ✅ 如果是測試模式
    if (test === true) {
      return new Response(JSON.stringify({ message: '測試成功' }), { status: 200 });
    }

    // ✅ 1. 儲存公告到 Supabase
    const { error } = await supabase
      .from('announcements')
      .insert([{ title, content, time, author, reads: 0 }]);

    if (error) {
      console.error('Supabase 插入錯誤:', error);
      return new Response(JSON.stringify({ error }), { status: 500 });
    }

    // ✅ 2. 推播到指定 LINE 使用者
    const lineRes = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`
      },
      body: JSON.stringify({                       
        to: 'U5dbd8b5fb153630885b656bb5f8ae011', // 指定的 LINE User ID
        messages: [
          {
            type: 'text',
            text: `📢 最新公告\n${title}\n${content}\n發布者：${author}\n時間：${time}`
          }
        ]
      })
    });

    if (!lineRes.ok) {
      const errText = await lineRes.text();
      return new Response(JSON.stringify({ error: errText }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err) {
    console.error('POST 錯誤:', err);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
  }
}

export async function GET() {
  return new Response('Method Not Allowed', { status: 405 });
}