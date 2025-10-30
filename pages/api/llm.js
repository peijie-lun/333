import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export const config = {
  runtime: 'edge',
};

// ✅ 初始化 Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// ✅ 載入 embedding 快取
const cachePath = path.join(process.cwd(), 'supabase_embeddings.json');
let embeddingCache = {};
if (fs.existsSync(cachePath)) {
  try {
    embeddingCache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
  } catch (err) {
    console.error('讀取 embedding 快取失敗:', err);
  }
}

// ✅ 模擬 embedding（實際應替換為真正模型）
function fakeEmbedding(text) {
  const hash = crypto.createHash('sha256').update(text).digest('hex');
  return Array.from({ length: 16 }, (_, i) =>
    parseInt(hash.slice(i * 4, i * 4 + 4), 16) % 1000
  );
}

// ✅ 計算餘弦相似度
function cosineSimilarity(a, b) {
  const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dot / (magA * magB);
}

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
    const queryEmbedding = fakeEmbedding(cleanQuery);

    // ✅ 找出最相近的 FAQ
    let bestMatch = null;
    let bestScore = -1;
    for (const [id, item] of Object.entries(embeddingCache)) {
      if (!item.embedding) continue;
      const score = cosineSimilarity(queryEmbedding, item.embedding);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = item.content;
      }
    }

    const answer = bestMatch || '目前無法找到相關資訊，請查看社區公告。';

    // ✅ 關鍵字判斷
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