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

    const {
      courier,
      recipient_name,
      recipient_room,
      tracking_number,
      arrived_at,
      test
    } = body;

    // --- 必填檢查 ---
    if (!courier || !recipient_name || !recipient_room || !arrived_at) {
      return Response.json(
        { error: 'courier, recipient_name, recipient_room, arrived_at 為必填' },
        { status: 400 }
      );
    }

    const time = new Date(arrived_at).toLocaleString('zh-TW', { hour12: false });

    // --- 測試模式 ---
    if (test === true) {
      return Response.json({ message: '測試成功' });
    }

    // --- 1. 儲存資料到 Supabase ---
    const { error } = await supabase.from('packages').insert([
      {
        courier,
        recipient_name,
        recipient_room,
        tracking_number: tracking_number || '',
        arrived_at,
        status: 'pending',
      },
    ]);

    if (error) {
      console.error('Supabase 插入錯誤:', error);
      return Response.json({ error }, { status: 500 });
    }

    // --- 2. 你的固定 LINE User ID，可改成動態 ---
    const lineUserId = 'U5dbd8b5fb153630885b656bb5f8ae011';

    // --- 3. Flex Message ---
    const flexMessage = {
      type: 'flex',
      altText: '📦 包裹通知',
      contents: {
        type: 'bubble',
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: '📦 包裹通知',
              weight: 'bold',
              size: 'lg',
              color: '#333333',
            },
            {
              type: 'separator',
              margin: 'md'
            },
            {
              type: 'text',
              text: `收件人：${recipient_name}`,
              margin: 'md'
            },
            {
              type: 'text',
              text: `房號：${recipient_room}`,
              margin: 'sm'
            },
            {
              type: 'text',
              text: `快遞公司：${courier}`,
              margin: 'sm'
            },
            {
              type: 'text',
              text: `追蹤號碼：${tracking_number || '無'}`,
              margin: 'sm'
            },
            {
              type: 'text',
              text: `到達時間：${time}`,
              margin: 'sm'
            }
          ]
        }
      }
    };

    // --- 4. 使用 LINE SDK 推播（強烈建議的方式） ---
    await client.pushMessage(lineUserId, flexMessage);

    // --- 成功回應 ---
    return Response.json({ success: true });

  } catch (err) {
    console.error('packages POST 錯誤:', err);
    return Response.json(
      { error: 'Internal Server Error', details: err.message },
      { status: 500 }
    );
  }
}

export async function GET() {
  return Response.json({ error: 'Method Not Allowed' }, { status: 405 });
}
