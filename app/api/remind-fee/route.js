// app/api/remind-fee/route.js
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
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

    // 1) 查詢 fees 表
    const { data: fee, error: feeErr } = await supabase
      .from('fees')
      .select('id, unit_id, amount, due, paid, note')
      .eq('id', feeId)
      .single()

    if (feeErr || !fee) {
      console.error('查詢 fees 表失敗:', feeErr)
      return NextResponse.json({ error: 'Fee not found' }, { status: 404 })
    }

    // 檢查是否已繳費
    if (fee.paid) {
      console.log('該費用已繳清，僅執行推播通知')
    } else {
      console.log('費用未繳，準備進行催繳通知')
    }

    // 2) 查詢 profiles 表
    const { data: profile, error: pErr } = await supabase
      .from('profiles')
      .select('id, name, unit_id, line_user_id')
      .eq('unit_id', fee.unit_id)
      .maybeSingle()

    if (pErr) {
      console.error('查詢 profiles 表失敗:', pErr)
      return NextResponse.json({ error: '查詢住戶資料失敗' }, { status: 500 })
    }

    if (!profile?.id) {
      return NextResponse.json({ error: `未找到單位 ID ${fee.unit_id} 的住戶` }, { status: 404 })
    }

    // 3) 確認 line_user_id
    let lineUserId = profile.line_user_id

    if (!lineUserId) {
      const { data: lu, error: luErr } = await supabase
        .from('line_users')
        .select('line_user_id')
        .eq('profile_id', profile.id)
        .maybeSingle()

      if (luErr) {
        console.error('查詢 line_users 表失敗:', luErr)
        return NextResponse.json({ error: '查詢 LINE 綁定失敗' }, { status: 500 })
      }

      lineUserId = lu?.line_user_id
    }

    if (!lineUserId) {
      return NextResponse.json({ error: '此住戶尚未完成 LINE 綁定' }, { status: 400 })
    }

    // 4) 發送通知
    const text =
      customMessage ??
      `親愛的${profile?.name ?? '住戶'}您好，\n` +
      `您本期的管理費尚未繳清：\n` +
      `金額：${fee.amount}\n` +
      `到期日：${fee.due}\n` +
      `狀態：${fee.paid ? '已繳' : '未繳'}\n` +
      `${fee.note ? `備註：${fee.note}` : ''}\n` +
      `請盡快完成繳費，謝謝！`

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
      console.error('LINE 推播失敗:', errText)
      return NextResponse.json({ error: 'LINE 推播失敗', detail: errText }, { status: 500 })
    }

    // 5) 更新 fees 表的 updated_at 欄位
    const { error: updateErr } = await supabase
      .from('fees')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', fee.id)

    if (updateErr) {
      console.error('更新 fees 表失敗:', updateErr)
      return NextResponse.json({ error: '更新費用記錄失敗' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('伺服器錯誤:', e)
    return NextResponse.json({ error: e.message || '伺服器錯誤' }, { status: 500 })
  }
}