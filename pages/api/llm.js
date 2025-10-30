import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export const config = {
  api: {
    bodyParser: true,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const { query } = req.body;

  if (!query || typeof query !== 'string') {
    res.status(400).json({ error: '請提供有效的查詢文字。' });
    return;
  }

  try {
    // 查詢 image 資料表，模糊比對 description 欄位
    const { data, error } = await supabase
      .from('image')
      .select('url, description')
      .ilike('description', `%${query}%`);

    if (error) {
      console.error('Supabase 查詢錯誤:', error);
      res.status(500).json({ error: '資料庫查詢失敗。' });
      return;
    }

    if (!data || data.length === 0) {
      res.status(200).json({
        answer: `目前沒有找到與「${query}」相關的圖片，請查看社區公告或稍後再試。`,
        images: [],
      });
      return;
    }

    res.status(200).json({
      answer: `以下是與「${query}」相關的圖片：`,
      images: data,
    });
  } catch (err) {
    console.error('API 錯誤:', err);
    res.status(500).json({ error: '伺服器錯誤，請稍後再試。' });
  }
}
