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

    // ✅ 關鍵字判斷（去除空白）
    const cleanQuery = query.trim();
    let keyword = '';
    if (cleanQuery.includes('社區設施')) keyword = '設施';
    else if (cleanQuery.includes('停車')) keyword = '停車';
    else if (cleanQuery.includes('風景')) keyword = '風景';

    let images = [];
    if (keyword) {
      const { data, error } = await supabase
        .from('images')
        .select('url, description')
        .ilike('description', `%${keyword}%`);

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

    // ✅ 如果沒有圖片，給預設圖片
    if (images.length === 0) {
      images = [
        {
          url: 'https://example.com/default.jpg',
          description: '預設圖片',
        },
      ];
    }

    const answer =
      images.length > 0
        ? `以下是與「${query}」相關的圖片：`
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