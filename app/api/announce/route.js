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

    // --- 必填檢查 ---
    if (!title || !content || !author) {
      return Response.json(
        { error: 'title, content, author 為必填' },
        { status: 400 }
      );
    }

    const time = new Date().toLocaleString('zh-TW', { hour12: false });

    // --- 測試模式 ---
    if (test === true) {
      return Response.json({ message: '測試成功，未推播' });
    }

    // --- 1. 儲存至 Supabase ---
    const { error } = await supabase
      .from('announcements')
      .insert([{ title, content, time, author, reads: 0 }]);

    if (error) {
      console.error('Supabase 插入錯誤:', error);
      return Response.json({ error }, { status: 500 });
    }

    // --- 2. Flex Message 結構 ---
    const flexMessage = {
      type: 'flex',
      altText: '📢 最新公告',
      contents: {
        type: 'bubble',
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'md',
          contents: [
            {
              type: 'text',
              text: '📢 最新公告',
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
              text: `📝 內容：${content}`,
              wrap: true,
            },
            {
              type: 'text',
              text: `👤 發布者：${author}`,
              color: '#aaaaaa',
              size: 'sm',
            },
            {
              type: 'text',
              text: `⏰ 時間：${time}`,
              color: '#aaaaaa',
              size: 'sm',
            },
          ],
        },
      },
    };

    // --- 3. 推播給所有好友（Broadcast） ---
    await client.broadcast(flexMessage);

    // --- 成功 ---
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
