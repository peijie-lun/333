import { createClient } from '@supabase/supabase-js';

export const config = {
  runtime: 'edge',
};

// ✅ Supabase 初始化（使用後端環境變數）
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

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

    // ✅ 關鍵字判斷（可擴充）
    const keywordMap = {
      '停車': ['停車', '車位', '車庫'],
      '設施': ['設施', '健身房', '游泳池', '公設'],
      '風景': ['風景', '景色', '湖', '山', '夕陽']
    };

    let matchedKeyword = '';
    for (const [key, keywords] of Object.entries(keywordMap)) {
      if (keywords.some(k => cleanQuery.includes(k))) {
        matchedKeyword = key;
        break;
      }
    }

    let images = [];
    if (matchedKeyword) {
      const { data, error } = await supabase
        .from('images')
        .select('url, description')
        .ilike('description', `%${matchedKeyword}%`);

      if (error) {
        console.error('Supabase 查詢錯誤:', error);
        return new Response(JSON.stringify({ error: 'Database query failed' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        });
      }

      images = data.map(item => ({
        url: item.url,
        description: item.description,
      }));
    }

    const answer = matchedKeyword
      ? `以下是與「${matchedKeyword}」相關的圖片與資訊：`
      : '目前沒有找到相關圖片，請查看社區公告。';

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