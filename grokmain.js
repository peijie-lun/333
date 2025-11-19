import dotenv from 'dotenv';
import { spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

// 修正 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 載入環境變數
dotenv.config({ path: path.join(__dirname, '.env') });

// 初始化 Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// ✅ 新增：圖片查詢函式
export async function getImageUrlsByKeyword(keyword) {
  try {
    const { data, error } = await supabase
      .from('image') // 你的資料表名稱
      .select('url, description')
      .ilike('description', `%${keyword}%`);

    if (error) {
      console.error('Supabase 查詢錯誤:', error);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error('getImageUrlsByKeyword 發生錯誤:', err);
    return [];
  }
}

// ✅ 保留原本的 LLM embedding 功能
const cachePath = path.join(__dirname, 'supabase_embeddings.json');
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL;

async function getEmbedding(text) {
  try {
    const py = spawnSync('python', [path.join(__dirname, 'embedding.py'), text], { encoding: 'utf-8' });
    if (py.error) {
      console.error('執行 Python 失敗:', py.error);
      return null;
    }
    if (py.status !== 0) {
      console.error('Python embedding.py 執行錯誤:', py.stderr);
      return null;
    }
    return JSON.parse(py.stdout);
  } catch (error) {
    console.error('Error getting embedding:', error);
  }
}

export async function generateAnswer(query) {
  const queryEmbedding = await getEmbedding(query);
  if (!queryEmbedding) {
    console.error('查詢向量生成失敗');
    return;
  }

  if (!fs.existsSync(cachePath)) {
    console.error('找不到 supabase_embeddings.json，請先執行 supabase_fetch.js');
    return;
  }

  let cache = {};
  try {
    cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
  } catch {
    console.error('supabase_embeddings.json 解析失敗');
    return;
  }

  const contextChunks = Object.values(cache);
  if (contextChunks.length === 0) {
    console.error('embedding 快取為空');
    return;
  }

  function cosineSimilarity(a, b) {
    const dot = a.reduce((sum, v, i) => sum + v * b[i], 0);
    const normA = Math.sqrt(a.reduce((sum, v) => sum + v * v, 0));
    const normB = Math.sqrt(b.reduce((sum, v) => sum + v * v, 0));
    return dot / (normA * normB);
  }

  const scored = contextChunks.map(chunk => ({
    chunk,
    sim: cosineSimilarity(queryEmbedding, chunk.embedding)
  }));
  scored.sort((a, b) => b.sim - a.sim);
  const top3 = scored.slice(0, 3);

  let mostRelevantChunk = top3[0].chunk;
  let maxSim = top3[0].sim;

  if (maxSim < 0.9) {
    const words = query.match(/[\u4e00-\u9fa5]|\w+/g) || [];
    let ngrams = [];
    for (let n = 1; n <= 3; n++) {
      for (let i = 0; i <= words.length - n; i++) {
        ngrams.push(words.slice(i, i + n).join(''));
      }
    }
    const keywordSet = new Set(ngrams);
    const fallbackChunks = contextChunks.filter(chunk => {
      return Array.from(keywordSet).some(kw => chunk.content.includes(kw));
    });
    if (fallbackChunks.length > 0) {
      const grouped = Array.from(keywordSet).map(kw => {
        const hits = contextChunks.filter(chunk => chunk.content.includes(kw));
        return hits.length > 0 ? `【${kw}】\n` + hits.map(c => c.content).join('\n') : '';
      }).filter(Boolean);
      mostRelevantChunk = { content: grouped.join('\n---\n') };
    }
  }

  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: "你是檢索增強型助理，回答一律使用繁體中文，只能根據參考資料回答，不可補充或推測任何未在參考資料中的內容。" },
          { role: "user", content: `問題：${query}\n\n參考資料：${mostRelevantChunk.content}` }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`
        }
      }
    );
    return response.data?.choices?.[0]?.message?.content || '無法取得答案';
  } catch (error) {
    console.error('Groq API 錯誤:', error.response?.data || error);
    return '查詢失敗';
  }
}