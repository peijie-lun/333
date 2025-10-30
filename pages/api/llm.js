import { createClient } from '@supabase/supabase-js';

export const config = {
  runtime: 'edge',
};

// ✅ 初始化 Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// ✅ Groq API 設定
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3-70b-8192';

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  try {
    const { query } = await req.json();
    if (!query || typeof query !== 'string') {
      return new Response(JSON.stringify({ error: 'Query is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      });
    }

    const cleanQuery = query.trim();

    // ✅ 呼叫 Groq LLM 回答問題
    const llmResponse = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          {
            role: 'system',
            content: '你是社區助理，請根據問題提供簡潔、清楚的回答。',
          },
          {
            role: 'user',
            content: cleanQuery,
          },
        ],
      }),
    });

    if (!llmResponse.ok) {
      console.error('Groq API 錯誤:', await llmResponse.text());
      return new Response(JSON.stringify({ error: 'LLM 回覆失敗' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      });
    }

    const llmData = await llmResponse.json();
    const answer = llmData.choices?.[0]?.message?.content?.trim() || '目前無法取得回答。';

    // ✅ 關鍵字判斷（可擴充）
    const keywordMap = {
      '風景': ['風景', '景色', '湖', '山', '夕陽'],
      '停車': ['停車', '車位', '車庫'],
      '設施': ['設施', '健身房', '游泳池', '公設'],
    };

    let matchedKeyword = '';
    for (const [key, keywords] of Object.entries(keywordMap)) {
      if (keywords.some(k => cleanQuery.includes(k))) {
        matchedKeyword = key;
        break;
      }
    }

    // ✅ 查詢圖片資料
    let images = [];
    if (matchedKeyword) {
      const { data, error } = await supabase
        .from('images')
        .select('url, description')
        .ilike('description', `%${matchedKeyword}%`);

      if (!error && data && data.length > 0) {
        images = data.map(item => ({
          url: item.url,
          description: item.description,
        }));
      }
    }

    return new Response(JSON.stringify({ answer, images }), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  } catch (err) {
    console.error('API 錯誤:', err);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
}