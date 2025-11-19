import dotenv from 'dotenv';
import { spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import axios from 'axios';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL;
const cachePath = path.join(process.cwd(), 'supabase_embeddings.json');

export async function getEmbedding(text) {
  try {
    const py = spawnSync('python', [path.join(process.cwd(), 'embedding.py'), text], { encoding: 'utf-8' });
    if (py.error) return null;
    if (py.status !== 0) return null;
    return JSON.parse(py.stdout);
  } catch {
    return null;
  }
}

export async function generateAnswer(query) {
  const queryEmbedding = await getEmbedding(query);
  if (!queryEmbedding) return '查詢向量生成失敗';

  if (!fs.existsSync(cachePath)) return '找不到 supabase_embeddings.json';

  const cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
  const contextChunks = Object.values(cache);

  if (!contextChunks.length) return 'embedding 快取為空';

  const cosineSimilarity = (a, b) => {
    const dot = a.reduce((sum, v, i) => sum + v * b[i], 0);
    const normA = Math.sqrt(a.reduce((sum, v) => sum + v * v, 0));
    const normB = Math.sqrt(b.reduce((sum, v) => sum + v * v, 0));
    return dot / (normA * normB);
  };

  const scored = contextChunks.map(chunk => ({ chunk, sim: cosineSimilarity(queryEmbedding, chunk.embedding) }));
  scored.sort((a, b) => b.sim - a.sim);
  let mostRelevantChunk = scored[0].chunk;
  let maxSim = scored[0].sim;

  if (maxSim < 0.9) {
    const words = query.match(/[\u4e00-\u9fa5]|\w+/g) || [];
    const ngrams = [];
    for (let n = 1; n <= 3; n++) {
      for (let i = 0; i <= words.length - n; i++) {
        ngrams.push(words.slice(i, i + n).join(''));
      }
    }
    const keywordSet = new Set(ngrams);
    const fallbackChunks = contextChunks.filter(chunk => Array.from(keywordSet).some(kw => chunk.content.includes(kw)));
    if (fallbackChunks.length > 0) {
      const grouped = Array.from(keywordSet)
        .map(kw => {
          const hits = contextChunks.filter(c => c.content.includes(kw));
          return hits.length ? `【${kw}】\n` + hits.map(c => c.content).join('\n') : '';
        })
        .filter(Boolean);
      mostRelevantChunk = { content: grouped.join('\n---\n') };
    }
  }

  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: '你是檢索增強型助理，回答一律使用繁體中文，只能根據參考資料回答，不可補充或推測任何未在參考資料中的內容。' },
          { role: 'user', content: `問題：${query}\n\n參考資料：${mostRelevantChunk.content}` }
        ]
      },
      { headers: { Authorization: `Bearer ${GROQ_API_KEY}` } }
    );
    return response.data?.choices?.[0]?.message?.content || '無法取得答案';
  } catch {
    return 'Groq API 呼叫失敗';
  }
}
