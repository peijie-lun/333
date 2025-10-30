import { createClient } from '@supabase/supabase-js';

export const config = {
  runtime: 'edge', // Vercel Edge Function
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
``

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

    // ✅ Step 1: 判斷關鍵字
    let keyword = '';
    if (query.includes('社區設施')) {
      keyword = '設施';
    } else if (query.includes('停車')) {
      keyword = '停車';
    } else {
      keyword = ''; // 預設查詢全部
    }

    // ✅ Step 2: 查詢 Supabase 資料表
    let dbQuery;
    if (keyword) {
      dbQuery = supabase
        .from('images')
        .select('url, description')
        .ilike('description', `%${keyword}%`);
    } else {
      dbQuery = supabase.from('images').select('url, description').limit(3);
    }

    const { data, error } = await dbQuery;

    if (error) {
      console.error('Supabase 查詢錯誤:', error);
      return new Response(JSON.stringify({ error: 'Database query failed' }), {
        status: 500,
      });
    }

    // ✅ Step 3: 組合回傳 JSON
    const images = data.map((item) => ({
      url: item.url,
      description: item.description,
    }));

    const answer =
      images.length > 0
        ? `以下是與「${query}」相關的圖片：`
        : '目前沒有找到相關圖片，請查看社區公告。';

    return new Response(
      JSON.stringify({
        answer,
        images,
      }),
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