import { createClient } from '@supabase/supabase-js';

export const config = {
  runtime: 'edge',
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
    });
  }

  try {
    const { query } = await req.json();
    if (!query) {
      return new Response(JSON.stringify({ error: 'Query is required' }), {
        status: 400,
      });
    }

    // ✅ 簡單關鍵字判斷
    let keyword = '';
    if (query.includes('社區設施')) keyword = '設施';
    else if (query.includes('停車')) keyword = '停車';
    else if (query.includes('風景')) keyword = '風景';

    // ✅ 查 Supabase
    let dbQuery;
    if (keyword) {
      dbQuery = supabase
        .from('images')
        .select('url, description')
        .ilike('description', `%${keyword}%`);
    } else {
      // ✅ 如果沒有關鍵字，不回傳前三筆，直接回空陣列
      return new Response(
        JSON.stringify({
          answer: '目前沒有找到相關圖片，請查看社區公告。',
          images: []
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const { data, error } = await dbQuery;
    if (error) {
      console.error('Supabase 查詢錯誤:', error);
      return new Response(JSON.stringify({ error: 'Database query failed' }), {
        status: 500,
      });
    }

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
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (err) {
    console.error('API 錯誤:', err);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
    });
  }
}