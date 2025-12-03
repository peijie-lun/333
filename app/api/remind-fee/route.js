
// app/api/remind-fee/route.js
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

const LINE_API = 'https://api.line.me/v2/bot/message/push'
const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN


export async function POST(req) {

  try {

    const { feeId, customMessage } = await req.json()
    if (!feeId) {
      return NextResponse.json({ error: 'feeId 必填' }, { status: 400 })
    }

    if (!LINE_TOKEN) {
      return NextResponse.json({ error: '缺少 LINE_CHANNEL_ACCESS_TOKEN 環境變數' }, { status: 500 })
    }

    // 1) 取帳單（注意：使用 due 欄位）
    const { data: fee, error: feeErr } = await supabase
      .from('fees')
      .select('id, room, amount, due, paid, note')
      .eq('id', feeId)
      .single()

    if (feeErr || !fee) {
      return NextResponse.json({ error: 'Fee not found' }, { status: 404 })
    }

    // 2) 依房號查 profiles（你已具備 room/name/line_user_id）
    const { data: profile, error: pErr } = await supabase
      .from('profiles')
      .select('id, name, room, line_user_id')
      .eq('room', fee.room)
      .limit(1)
      .maybeSingle()

    if (pErr) {
      return NextResponse.json({ error: '查詢 profiles 失敗', detail: pErr.message }, { status: 500 })
    }
    if (!profile?.id) {
      return NextResponse.json({ error: `未找到房號 ${fee.room} 的住戶（profiles）` }, { status: 400 })
    }

    // 3) 取得 line_user_id（優先用 profiles.line_user_id；否則回退查 line_users.profile_id）
    let lineUserId = profile.line_user_id ?? null

    if (!lineUserId) {
      const { data: lu, error: luErr } = await supabase
        .from('line_users')
        .select('line_user_id')
        .eq('profile_id', profile.id)
        .limit(1)
        .maybeSingle()

      if (luErr) {
        return NextResponse.json({ error: '查詢 line_users 失敗', detail: luErr.message }, { status: 500 })
      }
      lineUserId = lu?.line_user_id ?? null
    }

    if (!lineUserId) {
      return NextResponse.json({ error: '此住戶尚未完成 LINE 綁定（line_user_id 為空）' }, { status: 400 })
    }

    // 4) 組催繳訊息（使用 due）
    const text =
      customMessage ??
      `親愛的${profile?.name ?? fee.room}您好，
您本期的管理費尚未繳清：
房號：${fee.room}
金額：${fee.amount}
到期日：${fee.due}
狀態：${fee.paid ? '已繳' : '未繳'}
${fee.note ? `備註：${fee.note}` : ''}
請盡快完成繳費，謝謝！`

    // 5) 呼叫 LINE Push API
    const resp = await fetch(LINE_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${LINE_TOKEN}`,
      },
      body: JSON.stringify({
        to: lineUserId,
        messages: [{ type: 'text', text }],
      }),
    })

    if (!resp.ok) {
      const errText = await resp.text()
      return NextResponse.json({ error: 'LINE push failed', detail: errText }, { status: 500 })
    }

    // 6) 更新 updated_at（或你也可以新增 last_reminded_at 欄位）
    await supabase.from('fees').update({ updated_at: new Date().toISOString() }).eq('id', fee.id)

    return NextResponse.json({ ok: true })
  } catch (e) {
       return NextResponse.json({ error: e?.message ?? 'Server error' }, { status: 500 })
    }
}
