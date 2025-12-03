import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Client } from '@line/bot-sdk';

export const runtime = 'nodejs';

// --- LINE Bot ---
const client = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
});

// --- Supabase ---
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export async function POST(req) {
  try {
    const body = await req.json();
    const mode = body.mode;

    // =====================================================
    //  A. 管理者「催繳住戶」模式 (mode: "remind")
    // =====================================================
    if (mode === 'remind') {
      const { feeId, customMessage } = body;

      if (!feeId) {
        return NextResponse.json({ error: 'feeId 必填' }, { status: 400 });
      }

      // 1) 取帳單
      const { data: fee, error: feeErr } = await supabase
        .from('fees')
        .select('id, room, amount, due, paid, note')
        .eq('id', feeId)
        .single();

      if (feeErr || !fee) {
        return NextResponse.json({ error: 'Fee not found' }, { status: 404 });
      }

      // 2) 找對應房號的使用者（profiles）
      const { data: profile, error: pErr } = await supabase
        .from('profiles')
        .select('id, name, room, line_user_id')
        .eq('room', fee.room)
        .maybeSingle();
           
      if (pErr) return NextResponse.json({ error: '查詢 profiles 失敗', detail: pErr.message }, { status: 500 });

      if (!profile?.id)
        return NextResponse.json({ error: `未找到房號 ${fee.room} 的住戶` }, { status: 400 });

      // 3) line_user_id
      let lineUserId = profile.line_user_id ?? null;

      if (!lineUserId) {
        const { data: lu } = await supabase
          .from('line_users')
          .select('line_user_id')
          .eq('profile_id', profile.id)
          .maybeSingle();

        lineUserId = lu?.line_user_id ?? null;
      }

      if (!lineUserId)
        return NextResponse.json({ error: '此住戶未綁定 LINE' }, { status: 400 });

      // 4) 訊息內容
      const text =
        customMessage ??
        `📢 管理費催繳通知\n\n` +
          `親愛的 ${profile?.name ?? fee.room} 您好，\n` +
          `您的管理費尚未繳清：\n` +
          `🏠 房號：${fee.room}\n` +
          `💰 金額：${fee.amount}\n` +
          `📅 到期日：${fee.due}\n` +
          `狀態：${fee.paid ? '已繳' : '未繳'}\n` +
          `${fee.note ? `備註：${fee.note}\n` : ''}\n` +
          `請盡快完成繳費，謝謝！`;

      // 5) LINE 推播
      await client.pushMessage(lineUserId, [{ type: 'text', text }]);

      // 6) 更新最後催繳時間（可自行加欄位）
      await supabase.from('fees').update({ updated_at: new Date().toISOString() }).eq('id', fee.id);

      return NextResponse.json({ ok: true, message: '催繳已發送' });
    }

    // =====================================================
    //  B. 新增帳單 & 推播 (mode: "create")
    // =====================================================
    if (mode === 'create') {
      const { room, amount, due, invoice, test } = body;

      if (!room || !amount || !due) {
        return NextResponse.json(                                               
          { error: 'room, amount, due 為必填' },
          { status: 400 }
        );
      }

      const createdAt = new Date().toLocaleString('zh-TW', { hour12: false });

      // 測試模式：不寫 DB、不推播
      if (test === true) {
        return NextResponse.json({ message: '測試成功' });
      }

      // 1) 新增帳單
      const { data, error } = await supabase
        .from('fees')
        .insert([
          {
            room,
            amount,
            due,
            invoice: invoice || '',
            created_at: createdAt,
          },
        ])
        .select('id');

      if (error) {
        console.error('Supabase 插入錯誤:', error);
        return NextResponse.json({ error }, { status: 500 });
      }

      // 2) 找住戶 LINE ID（用 profiles）
      const { data: profile } = await supabase
        .from('profiles')
        .select('line_user_id, name')
        .eq('room', room)
        .maybeSingle();

      let lineUserId = profile?.line_user_id;

      if (lineUserId) {
        const notifyText =
          `💰 管理費通知\n` +
          `房號：${room}\n` +
          `金額：NT$ ${amount}\n` +
          `到期日：${due}\n` +
          `發票：${invoice || '無'}\n` +
          `建立時間：${createdAt}`;

        await client.pushMessage(lineUserId, [{ type: 'text', text: notifyText }]);
      }

      return NextResponse.json({ success: true, id: data?.[0]?.id });
    }

    // =====================================================
    //  C. 其他 mode 無效
    // =====================================================
    return NextResponse.json({ error: '未知的 mode' }, { status: 400 });

  } catch (err) {
    console.error('fees API 錯誤:', err);
    return NextResponse.json(
      { error: 'Internal Server Error', detail: err.message },
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
