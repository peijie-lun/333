import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { spawnSync } from 'child_process';

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL;

function getEmbedding(text) {
  const py = spawnSync('python', [path.resolve('./embedding.py'), text], { encoding: 'utf-8' });
  if (py.error || py.status !== 0) return null;
  try {
    return JSON.parse(py.stdout);
  } catch {
    return null;
  }
}

function cosineSimilarity(a, b) {
  const dot = a.reduce((sum, v, i) => sum + v * b[i], 0);
  const normA = Math.sqrt(a.reduce((sum, v) => sum + v * v, 0));
  const normB = Math.sqrt(b.reduce((sum, v) => sum + v * v, 0));
  return dot / (normA * normB);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { query } = req.body;
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid query' });
  }

  const cachePath = path.resolve('./supabase_embeddings.json');
  if (!fs.existsSync(cachePath)) {
    return res.status(500).json({ error: '快取檔案不存在' });
  }

  const cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
  const keywords = ['設施', '公告設施', '泳池', '健身房', '閱覽室', '停車場'];
  const hasKeyword = keywords.some(kw => query.includes(kw));

  if (hasKeyword) {
    const facilityItems = Object.values(cache)
      .filter(item => item.url && /\.(jpg|jpeg|png)$/i.test(item.url))
      .slice(0, 3);

    const carousel = facilityItems.map(item => ({
      title: item.title || '社區設施',
      url: item.url,
      description: item.content || '請查看詳細資訊'
    }));

    return res.status(200).json({ answer: '以下是社區設施資訊：', carousel });
  }

  const queryEmbedding = getEmbedding(query);
  if (!queryEmbedding) {
    return res.status(500).json({ error: 'Embedding 生成失敗' });
  }

  const scored = Object.values(cache).map(item => ({
    item,
    score: cosineSimilarity(queryEmbedding, item.embedding),
  }));
  scored.sort((a, b) => b.score - a.score);
  const topItems = scored.slice(0, 3).map(s => s.item);
  const referenceText = topItems.map(i => i.content).join('\n\n') || '（無相關資料）';

  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: '你是檢索增強型助理，回答一律使用繁體中文，只能根據參考資料回答。' },
          { role: 'user', content: `問題：${query}\n\n參考資料：${referenceText}` }
        ]
      },
      { headers: { Authorization: `Bearer ${GROQ_API_KEY}` } }
    );

    const answer = response.data?.choices?.[0]?.message?.content?.trim() || '目前沒有找到相關資訊';
    return res.status(200).json({ answer });
  } catch (error) {
    console.error('Groq API 錯誤:', error.response?.data || error.message);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}