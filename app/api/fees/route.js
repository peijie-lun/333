
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
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

export async function POST(req) {
  try {
    const body = await req.json();
    const { room, amount, due, invoice, test } = body;

    // 防呆檢查
    if (!room || !amount || !due) {
      return Response.json({ error: 'room, amount, due 為必填' }, { status: 400 });
    }

    // 測試模式
    if (test === true) {
      return Response.json({ message: '測試成功' });
    }

    // 1. 儲存到 Supabase
    const { error } = await supabase.from('fees').insert([{
      room,
      amount,
      due,
      invoice: invoice || ''
    }]);

    if (error) {
      console.error('Supabase 插入錯誤:', error);
      return Response.json({ error }, { status: 500 });
    }

    // 2. 固定推播 LINE User ID
    const lineUserId = 'U5dbd8b5fb153630885b656bb5f8ae011'; // 測試用

    // 3. Flex Message
    const flexMessage = {
      type: 'flex',
      altText: '💰 管理費通知',
      contents: {
        type: 'bubble',
        body: {
          layout: 'vertical',
          contents: [
            { type: 'text', text: '💰 管理費通知', weight: 'bold', size: 'lg', color: '#333' },
            { type: 'separator', margin: 'md' },
            { type: 'text', text: `房號：${room}`, margin: 'md' },
            { type: 'text', text: `金額：NT$ ${amount}`, margin: 'sm' },
            { type: 'text', text: `到期日：${due}`, margin: 'sm' },
            { type: 'text', text: `發票號碼：${invoice || '無'}`, margin: 'sm' }
          ]
        }
      }
    };

    await client.pushMessage(lineUserId, flexMessage);

    return Response.json({ success: true });
  } catch (err) {
    console.error('fees POST 錯誤:', err);
    return Response.json({ error: 'Internal Server Error', details: err.message }, { status: 500 });
  }
}

export async function GET() {
  return Response.json({ error: 'Method Not Allowed' }, { status: 405 });
}

