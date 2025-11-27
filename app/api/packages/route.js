
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
    const { courier, recipient_name, recipient_room, tracking_number, arrived_at, test } = body;

    // 防呆：必填欄位
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

    // --- 1. 儲存到 Supabase ---
    const { error } = await supabase
      .from('packages')
      .insert([{
        courier,
        recipient_name,
        recipient_room,
        tracking_number: tracking_number || '',
        arrived_at,
        status: 'pending'
      }]);

    if (error) {
      console.error('Supabase 插入錯誤:', error);
      return Response.json({ error }, { status: 500 });
    }

    // --- 2. 固定 LINE User ID（測試用）
    const lineUserId = 'U5dbd8b5fb153630885b656bb5f8ae011'; // 請換成你的測試用 LINE User ID

    // --- 3. 推播到 LINE ---
    const pushBody = {
      to: lineUserId,
      messages: [
        {
          type: 'flex',
          altText: '📦 包裹通知',
          contents: {
            type: 'bubble',
            body: {
              layout: 'vertical',
              contents: [
                { type: 'text', text: '📦 包裹通知', weight: 'bold', size: 'lg', color: '#333' },
                { type: 'separator', margin: 'md' },
                { type: 'text', text: `收件人：${recipient_name}`, margin: 'md' },
                { type: 'text', text: `房號：${recipient_room}`, margin: 'sm' },
                { type: 'text', text: `快遞公司：${courier}`, margin: 'sm' },
                { type: 'text', text: `追蹤號碼：${tracking_number || '無'}`, margin: 'sm' },
                { type: 'text', text: `到達時間：${time}`, margin: 'sm' }
              ]
            }
          }
        }
      ]
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
