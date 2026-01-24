


import { chat } from '../../../grokmain.js';
import { supabase } from '../../../supabaseClient';

export async function POST(req) {
  try {
    const { query, userId, eventId } = await req.json();
    if (!query) {
      return new Response(JSON.stringify({ error: '缺少 query 參數' }), { status: 400 });
    }
    
    // 防重複：檢查此 eventId 是否已處理過
    if (eventId) {
      const { data: existingLog } = await supabase
        .from('chat_log')
        .select('id, raw_question')
        .eq('event_id', eventId)
        .single();
      
      if (existingLog) {
        console.log('[防重複] eventId 已存在，跳過寫入:', eventId);
        // 回傳已存在的記錄，避免重複處理
        const { data: existingData } = await supabase
          .from('chat_log')
          .select('*')
          .eq('id', existingLog.id)
          .single();
        return new Response(JSON.stringify({ 
          answer: '(快取回應)',
          chatLogId: existingLog.id,
          cached: true 
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
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
      user_id: userId || null,
      event_id: eventId || null, // 記錄 LINE eventId
      created_at: new Date().toISOString(),
    };


    // 寫入 Supabase chat_log，並檢查回傳 error
    const { error: insertError, data: insertData } = await supabase.from('chat_log').insert([logData]).select();
    if (insertError) {
      console.error('[Supabase Insert Error]', insertError);
      return new Response(JSON.stringify({ ...result, supabase_error: insertError.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // 取得新插入的 chat_log id
    const chatLogId = insertData?.[0]?.id;

    return new Response(JSON.stringify({ ...result, chatLogId }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
