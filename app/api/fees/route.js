
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

export async function POST(req) {
  try {
    const body = await req.json();
    const { room, amount, due, invoice } = body;

    // 防呆檢查
    if (!room || !amount || !due) {
      return NextResponse.json({ error: 'room, amount, due 為必填' }, { status: 400 });
    }

    // 1. 新增管理費資料到 Supabase
    const { data, error } = await supabase
      .from('fees')
      .insert([{ room, amount, due, invoice: invoice || '' }])
      .select();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 2. 固定推播 LINE User ID（測試用）
    const lineUserId = 'U5dbd8b5fb153630885b656bb5f8ae011'; // 請換成你的 LINE 測試帳號 ID

    // 3. 正確 Flex Message 格式
    const message = {
      to: lineUserId,
      messages: [
        {
          type: 'flex',
          altText: '管理費通知',
          contents: {
            type: 'bubble',
            body: {
              layout: 'vertical',
              contents: [
                {
                  type: 'text',
                  text: '💰 管理費通知',
                  weight: 'bold',
                  size: 'lg',
                  color: '#333'
                },
                { type: 'separator', margin: 'md' },
                { type: 'text', text: `房號：${room}`, margin: 'md' },
                { type: 'text', text: `金額：NT$ ${amount}`, margin: 'sm' },
                { type: 'text', text: `到期日：${due}`, margin: 'sm' },
                { type: 'text', text: `發票號碼：${invoice || '無'}`, margin: 'sm' }
              ]
            }
          }
        }
      ]
    };

    // 4. 呼叫 LINE 推播 API
    const lineRes = await axios.post('https://api.line.me/v2/bot/message/push', message, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`
      }
    });

    if (lineRes.status !== 200) {
      const errText = lineRes.data || 'LINE 推播失敗';
      return NextResponse.json({ error: errText }, { status: 400 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
