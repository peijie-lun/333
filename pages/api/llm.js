import { createClient } from '@supabase/supabase-js';

export const config = {
  runtime: 'edge', // Vercel Edge Function
};

// ✅ 使用 Anon Key（RLS disabled）或 Service Key（如果啟用 RLS）
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY // 如果啟用 RLS，改成 process.env.SUPABASE_SERVICE_KEY
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
    if (!query) {
      return new Response(JSON.stringify({ error: 'Query is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      });
    }

    // ✅ Step 1: 簡單關鍵字判斷（可擴充成 LLM 語意判斷）
    let keyword = '';
    if (query.includes('社區設施')) keyword = '設施';
    else if (query.includes('停車')) keyword = '停車';
    else if (query.includes('風景')) keyword = '風景';

    // ✅ Step 2: 查詢 Supabase
    let dbQuery;
    if (keyword) {
      dbQuery = supabase
        .from('images')
        .select('url, description')
        .ilike('description', `%${keyword}%`);
    } else {
      // 如果沒有關鍵字，直接回傳空陣列
      return new Response(
        JSON.stringify({
          answer: '目前沒有找到相關圖片，請查看社區公告。',
          images: [],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        }
      );
    }

    const { data, error } = await dbQuery;
    if (error) {
      console.error('Supabase 查詢錯誤:', error);
      return new Response(JSON.stringify({ error: 'Database query failed' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      });
    }

    // ✅ Step 3: 組合回傳 JSON
    const images = data.map(item => ({
      url: item.url,
      description: item.description,
    }));

    const answer =
      images.length > 0
        ? `以下是與「${query}」相關的圖片：`
        : '目前沒有找到相關圖片，請查看社區公告。';

    return new Response(
      JSON.stringify({ answer, images }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      }
    );
  } catch (err) {
    console.error('API 錯誤:', err);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
}