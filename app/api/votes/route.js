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
    const { error } = await supabase.from('votes').insert([
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

    // --- 2. Flex Message（也可以用 text message） ---
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
