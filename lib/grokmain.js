import dotenv from 'dotenv';
import { spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import axios from 'axios';

// 明確指定 .env 路徑
dotenv.config({ path: path.join(__dirname, '.env') });

// 可選:整合自動同步功能 (適合長期運行的伺服器)
const USE_AUTO_SYNC = process.env.USE_AUTO_SYNC === 'true';
if (USE_AUTO_SYNC) {
  const { startAutoSync } = await import('./supabase_auto_sync.js');
  startAutoSync()
    .then(() => {
      console.log('✅ 自動同步已啟動');
    })
    .catch(err => {
      console.error('❌ 自動同步啟動失敗:', err);
    });
}

// 檢查快取是否存在,不存在才執行初始載入
const cachePath = path.join(__dirname, 'supabase_embeddings.json');

// 只有快取不存在時才執行初始載入,否則直接使用現有快取
if (!fs.existsSync(cachePath)) {
  console.log('⚠️ 快取不存在,執行初始載入...');
  const supabasePath = path.join(__dirname, 'supabase_fetch.js');
  const supabaseResult = spawnSync('node', [supabasePath], { stdio: 'inherit' });
  if (supabaseResult.error || supabaseResult.status !== 0) {
    console.error('❌ 執行 supabase_fetch.js 失敗');
  }
} else {
  console.log('✅ 使用現有快取');
}

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
    try {
      const embedding = JSON.parse(py.stdout);
      return embedding;
    } catch (e) {
      console.error('embedding.py 回傳格式解析失敗:', py.stdout);
      return null;
    }
  } catch (error) {
    console.error('Error getting embedding:', error);
  }
}

async function generateAnswer(query) {
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

  console.log('--- 查詢相似度前3參考資料 ---');
  top3.forEach((item, idx) => {
    console.log(`#${idx + 1} 相似度:`, item.sim);
    console.log(item.chunk.content);
    console.log('-----------------------------');
  });

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
    console.log('[fallback debug] 關鍵字（含詞組）：', Array.from(keywordSet));
    const fallbackChunks = contextChunks.filter(chunk => {
      return Array.from(keywordSet).some(kw => chunk.content.includes(kw));
    });
    console.log('[fallback debug] 命中數：', fallbackChunks.length);
    if (fallbackChunks.length > 0) {
      console.log('--- fallback 關鍵字命中 ---');
      const kwArr = Array.from(keywordSet);
      let grouped = [];
      kwArr.forEach((kw, idx) => {
        const hits = contextChunks.filter(chunk => chunk.content.includes(kw));
        if (hits.length > 0) {
          console.log(`【${kw}】命中${hits.length}筆`);
          hits.forEach((c, i) => {
            console.log(`  #${i + 1}：`, c.content);
          });
          grouped.push(`【${kw}】\n` + hits.map(c => c.content).join('\n'));
        }
      });
      mostRelevantChunk = { content: grouped.join('\n---\n') };
    } else {
      console.log('--- fallback 也沒命中任何資料 ---');
    }
  }

  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: "你是檢索增強型助理，回答一律使用繁體中文，只能根據參考資料回答，不可補充或推測任何未在參考資料中的內容。即使相關度低，也請根據參考資料盡量回答。" },
          { role: "user", content: `問題：${query}\n\n參考資料：${mostRelevantChunk.content}` }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`
        }
      }
    );
    if (response.data && response.data.choices && response.data.choices[0] && response.data.choices[0].message && response.data.choices[0].message.content) {
      console.log('Answer:', response.data.choices[0].message.content);
    } else {
      console.error('Groq API 回傳格式異常:', response.data);
    }
  } catch (error) {
    if (error.response) {
      console.error('Groq API 錯誤:', error.response.data);
    } else {
      console.error('Error generating answer:', error);
    }
  }
}

// 查詢
generateAnswer('可不可以養寵物?');