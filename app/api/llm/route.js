


import { chat } from '../../../grokmain.js';
import { supabase } from '../../../supabaseClient';

export async function POST(req) {
  try {
    const { query } = await req.json();
    if (!query) {
      return new Response(JSON.stringify({ error: '缺少 query 參數' }), { status: 400 });
    }
    // 呼叫 chat 取得回答與相關資訊
    const result = await chat(query);

    // 準備要寫入 chat_log 的欄位
    // 假設 result 會回傳 normalized_question、intent、intent_confidence、answered
    // 若沒有，這裡可根據你的 chat 回傳內容調整
    const logData = {
      raw_question: query,
      normalized_question: result.normalized_question || query, // 若無正規化則用原文
      intent: result.intent || null,
      intent_confidence: typeof result.intent_confidence === 'number' ? result.intent_confidence : null,
      answered: typeof result.answered === 'boolean' ? result.answered : (result.answer ? true : false),
      created_at: new Date().toISOString(),
    };


    // 寫入 Supabase chat_log，並檢查回傳 error
    const { error: insertError, data: insertData } = await supabase.from('chat_log').insert([logData]);
    if (insertError) {
      console.error('[Supabase Insert Error]', insertError);
      return new Response(JSON.stringify({ ...result, supabase_error: insertError.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    // 可選：log 寫入成功的資料
    // console.log('[Supabase Insert Success]', insertData);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
