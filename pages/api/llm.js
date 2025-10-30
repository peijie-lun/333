import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import axios from 'axios';

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL;

function getEmbedding(text) {
  const result = spawnSync('python3', [path.resolve('./embedding.py'), text], {
    encoding: 'utf-8',
  });
  if (result.error || result.status !== 0) return null;
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

function cosineSimilarity(a, b) {
  const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const normA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const normB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dot / (normA * normB);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const { query } = req.body;
  if (!query || typeof query !== 'string') {
    res.status(400).json({ error: 'Missing or invalid query' });
    return;
  }

  const cachePath = path.resolve('./supabase_embeddings.json');
  if (!fs.existsSync(cachePath)) {
    res.status(500).json({ error: '快取檔案不存在' });
    return;
  }

  const cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
  const queryEmbedding = getEmbedding(query);
  if (!queryEmbedding) {
    res.status(500).json({ error: 'Embedding 失敗' });
    return;
  }

  const scored = Object.values(cache).map(item => ({
    item,
    score: cosineSimilarity(queryEmbedding, item.embedding),
  }));

  scored.sort((a, b) => b.score - a.score);
  const topItems = scored.slice(0, 3).map(s => s.item);

  const referenceText = topItems.map(i => i.content).join('\n\n');

  // ✅ 改進圖片選擇邏輯
  const imageItem = topItems.find(i => i.url && /\.(jpg|jpeg|png)$/i.test(i.url));
  const imageUrl = imageItem?.url || 'https://example.com/default.jpg';

  console.log('參考資料:', referenceText);
  console.log('圖片項目:', imageItem);
  console.log('圖片 URL:', imageUrl);

  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: GROQ_MODEL,
        messages: [
          {
            role: 'system',               
            content: '你是檢索增強型助理，回答一律使用繁體中文，只能根據參考資料回答。',
          },
          {
            role: 'user',
            content: `問題：${query}\n\n參考資料：${referenceText}`,
          },
        ],
      },
      {
        headers: {      
          Authorization: `Bearer ${GROQ_API_KEY}`,
        },               
      }
    );

    let answer = response.data?.choices?.[0]?.message?.content?.trim();
    if (!answer || answer.length < 2) {       
      answer = '目前沒有找到相關資訊，請查看社區公告。';
    }

    res.status(200).json({ answer, image: imageUrl });
  } catch (error) {
    console.error('LLM API error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}