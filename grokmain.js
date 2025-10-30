
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL;

const cachePath = path.join(__dirname, 'supabase_embeddings.json');

function cosineSimilarity(a, b) {
  const dot = a.reduce((sum, v, i) => sum + v * b[i], 0);
  const normA = Math.sqrt(a.reduce((sum, v) => sum + v * v, 0));
  const normB = Math.sqrt(b.reduce((sum, v) => sum + v * v, 0));
  return dot / (normA * normB);
}

async function getEmbedding(text) {
  const { spawnSync } = require('child_process');
  const py = spawnSync('python', [__dirname + '/embedding.py', text], { encoding: 'utf-8' });
  if (py.error || py.status !== 0) return null;
  try {
    return JSON.parse(py.stdout);
  } catch {
    return null;
  }
}

async function generateAnswer(query) {
  const queryEmbedding = await getEmbedding(query);
  if (!queryEmbedding) return { type: 'text', content: '查詢向量生成失敗' };

  if (!fs.existsSync(cachePath)) return { type: 'text', content: '找不到快取資料' };
  let cache = {};
  try {
    cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
  } catch {
    return { type: 'text', content: '快取解析失敗' };
  }

  const contextChunks = Object.values(cache);
  if (contextChunks.length === 0) return { type: 'text', content: '快取為空' };

  const scored = contextChunks.map(chunk => ({
    chunk,
    sim: cosineSimilarity(queryEmbedding, chunk.embedding)
  })).sort((a, b) => b.sim - a.sim);

  const top = scored[0].chunk;

  if (top.type === 'image') {
    return {
      type: 'image',
      items: [{ title: '圖片查詢結果', url: top.url }]
    };
  }

  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: '你是檢索型助理，只根據參考資料回答問題，使用繁體中文。' },
          { role: 'user', content: `問題：${query}

參考資料：${top.content}` }
        ]
      },
      {
        headers: { Authorization: `Bearer ${GROQ_API_KEY}` }
      }
    );

    const answer = response?.data?.choices?.[0]?.message?.content || '查無結果';
    return { type: 'text', content: answer };
  } catch (error) {
    return { type: 'text', content: 'Groq API 查詢失敗' };
  }
}

module.exports = { generateAnswer };
