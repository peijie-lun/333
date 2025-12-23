import { NextResponse } from 'next/server';
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
    const { room, amount, due, invoice, test } = body;

    // --- 防呆檢查 ---
    if (!room || !amount || !due) {
      return NextResponse.json(
        { error: 'room, amount, due 為必填' },
        { status: 400 }
      );
    }

    const time = new Date().toLocaleString('zh-TW', { hour12: false });

    // --- 測試模式 ---
    if (test === true) {
      return NextResponse.json({ message: '測試成功' });
    }

    // --- 2. LINE 推播 ---
    // 先從 units 表中查詢 unit_id
    console.log('查詢 units 表的 unit_number:', room); // 調試用，打印 room 的值
    const { data: unitData, error: unitError } = await supabase
      .from('units')
      .select('id')
      .eq('unit_number', room) // 使用 unit_number 作為查詢條件
      .single();

    if (unitError) {
      if (unitError.code === 'PGRST116') {
        console.error('查詢 units 表無結果，可能單位編號不存在:', unitError);
        return NextResponse.json(
          { error: '查無對應單位編號，請確認輸入是否正確' },
          { status: 404 }
        );
      }
      console.error('查詢 units 表失敗:', unitError);
      return NextResponse.json(
        { error: '查詢單位資料失敗，無法推播 LINE 訊息' },
        { status: 500 }
      );
    }

    const unitId = unitData.id;

    // 再用 unit_id 查詢 profiles 表
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('line_user_id')
      .eq('unit_id', unitId)
      .single();

    if (profileError || !profile) {
      console.error('查詢 profiles 表失敗:', profileError);
      return NextResponse.json(
        { error: '查詢住戶資料失敗，無法推播 LINE 訊息' },
        { status: 500 }
      );
    }

    const lineUserId = profile.line_user_id; // 使用查詢到的 line_user_id

    const pushBody = {
      to: lineUserId,
      messages: [
        {
          type: 'text',
          text:
            `💰 管理費通知\n` +
            `房號：${room}\n` +
            `金額：NT$ ${amount}\n` +
            `到期日：${due}`
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
      return NextResponse.json({ error: errText }, { status: 500 });
    }

    console.log('管理費通知已成功發送');

    // --- 1. 儲存到 Supabase ---
    const { data, error } = await supabase
      .from('fees')
      .insert([
        {
          unit_id: unitId, // 使用從 units 表查詢到的 unit_id
          amount,
          due
        }
      ])
      .select('id');

    if (error) {
      console.error('Supabase 插入錯誤:', error);
      return NextResponse.json({ error }, { status: 500 });
    }

    // --- 成功 ---
    return NextResponse.json({ success: true, id: data?.[0]?.id });

  } catch (err) {
    console.error('fees POST 錯誤:', err);
    return NextResponse.json(
      { error: 'Internal Server Error', details: err.message },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { error: 'Method Not Allowed' },
    { status: 405 }
  );
}
