
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
    const { room, amount, due, invoice, test } = body;

    // --- 防呆檢查 ---
    if (!room || !amount || !due) {
      return Response.json(
        { error: 'room, amount, due 為必填' },
        { status: 400 }
      );
    }

    const time = new Date().toLocaleString('zh-TW', { hour12: false });

    // --- 測試模式 ---
    if (test === true) {
      return Response.json({ message: '測試成功' });
    }

    // --- 1. 儲存到 Supabase ---
    const { data, error } = await supabase
      .from('fees')
      .insert([
        {
          room,
          amount,
          due,
          invoice: invoice || '',
          created_at: time
        }
      ])
      .select('id');

    if (error) {
      console.error('Supabase 插入錯誤:', error);
      return Response.json({ error }, { status: 500 });
    }

    // --- 2. LINE 推播 ---
    const lineUserId = 'U5dbd8b5fb153630885b656bb5f8ae011'; // 之後可改成動態

    const pushBody = {
      to: lineUserId,
      messages: [
        {
          type: 'text',
          text:
            `💰 管理費通知\n` +
            `房號：${room}\n` +
            `金額：NT$ ${amount}\n` +
            `到期日：${due}\n` +
            `發票：${invoice || '無'}\n` +
            `建立時間：${time}`
        }
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

    // --- 成功 ---
    return Response.json({ success: true, id: data?.[0]?.id });

  } catch (err) {
    console.error('fees POST 錯誤:', err);
    return Response.json(
      { error: 'Internal Server Error', details: err.message },
      { status: 500 }
    );
  }
}

export async function GET() {
  return Response.json(
    { error: 'Method Not Allowed' },
    { status: 405 }
  );
}
 