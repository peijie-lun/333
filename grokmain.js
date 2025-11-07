require('dotenv').config({ path: __dirname + '/.env' }); // 明確指定 .env 路徑

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { spawnSync } = require('child_process');

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL;

/**
 * 取得文字的 embedding
 */
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
    return null;
  }
}

/**
 * 計算餘弦相似度
 */
function cosineSimilarity(a, b) {
  const dot = a.reduce((sum, v, i) => sum + v * b[i], 0);
  const normA = Math.sqrt(a.reduce((sum, v) => sum + v * v, 0));
  const normB = Math.sqrt(b.reduce((sum, v) => sum + v * v, 0));
  return dot / (normA * normB);
}

/**
 * 擷取圖片 URL
 */
function extractImageUrl(text) {
  const match = text.match(/https?:\/\/\S+\.(jpg|jpeg|png|webp)[^\s]*/i);
  return match ? match[0] : null;
}

/**
 * fallback 關鍵字比對
 */
function keywordMatch(query, chunks) {
  const words = query.match(/[\u4e00-\u9fa5]|\w+/g) || [];
  const keywordSet = new Set(words);
  return chunks
    .filter(chunk => Array.from(keywordSet).some(kw => chunk.content.includes(kw)))
    .map(c => c.content);
}

/**
 * 主函式：檢索 + 語義判斷 + Groq API
 */
async function generateAnswer(query) {
  // 1. 取得 query embedding
  const queryEmbedding = await getEmbedding(query);
  if (!queryEmbedding) {
    return { answer: '查詢向量生成失敗', image: null };
  }

  // 2. 讀取快取檔案
  const cachePath = path.join(__dirname, 'supabase_embeddings.json');
  if (!fs.existsSync(cachePath)) {
    return { answer: '找不到快取檔案，請先執行 supabase_fetch.js', image: null };
  }

  let cache;
  try {
    cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
  } catch {
    return { answer: '快取檔案解析失敗', image: null };
  }

  const contextChunks = Object.values(cache);
  if (contextChunks.length === 0) {
    return { answer: '快取為空', image: null };
  }

  // 3. 計算相似度並排序
  const scored = contextChunks.map(chunk => ({
    chunk,
    sim: cosineSimilarity(queryEmbedding, chunk.embedding)
  }));
  scored.sort((a, b) => b.sim - a.sim);
  const top3 = scored.slice(0, 3);

  let mostRelevantChunk = top3[0].chunk;
  let maxSim = top3[0].sim;

  // 4. fallback：若最高分低於 0.7，改用關鍵字比對
  if (maxSim < 0.7) {
    const fallbackChunks = keywordMatch(query, contextChunks);
    if (fallbackChunks.length > 0) {
      mostRelevantChunk = { content: fallbackChunks.join('\n---\n') };
    }
  }

  // 5. 擷取圖片 URL
  const imageUrl = extractImageUrl(mostRelevantChunk.content) || 'https://example.com/default.jpg';

  // 6. 呼叫 Groq API
  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: GROQ_MODEL,
        messages: [
          {
            role: 'system',
            content: '你是檢索增強型助理，回答一律使用繁體中文，只能根據參考資料回答，不可補充或推測任何未在參考資料中的內容。'
          },
          {
            role: 'user',
            content: `問題：${query}\n\n參考資料：${mostRelevantChunk.content}`
          }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`
        }
      }
    );

    const answer = response.data?.choices?.[0]?.message?.content?.trim() || '目前沒有找到相關資訊';
    return { answer, image: imageUrl };
  } catch (error) {
    console.error('Groq API 錯誤:', error.response?.data || error.message);
    return { answer: '系統錯誤，請稍後再試', image: imageUrl };
  }
}

module.exports = { generateAnswer };