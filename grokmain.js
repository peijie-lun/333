
require('dotenv').config({ path: __dirname + '/.env' });  // 明確指定 .env 路徑

// 僅執行 supabase_fetch.js，確保 embedding 快取最新
const { spawnSync } = require('child_process');
const path = require('path');
const supabasePath = path.join(__dirname, 'supabase_fetch.js');
const supabaseResult = spawnSync('node', [supabasePath], { stdio: 'inherit' });
if (supabaseResult.error || supabaseResult.status !== 0) {
  console.error('執行 supabase_fetch.js 失敗');
}
const axios = require('axios');
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL;

async function getEmbedding(text) {
  try {
    // 呼叫embedding.py
    const py = spawnSync('python', [__dirname + '/embedding.py', text], { encoding: 'utf-8' });
    if (py.error) {
      console.error('執行 Python 失敗:', py.error);
      return null;
    }
    if (py.status !== 0) {
      console.error('Python embedding.py 執行錯誤:', py.stderr);
      return null;
    }
    // 解析 JSON
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
  //  把 query 轉換為向量
  const queryEmbedding = await getEmbedding(query);
  if (!queryEmbedding) {
    console.error('查詢向量生成失敗');
    return;
  }
  // 只讀取 supabase_embeddings.json 快取
  const fs = require('fs');
  const path = require('path');
  const cachePath = path.join(__dirname, 'supabase_embeddings.json');
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
  // Step 3: 根據餘弦相似度選擇最相關段落（不強制查無資料）
  function cosineSimilarity(a, b) {
    const dot = a.reduce((sum, v, i) => sum + v * b[i], 0);
    const normA = Math.sqrt(a.reduce((sum, v) => sum + v * v, 0));
    const normB = Math.sqrt(b.reduce((sum, v) => sum + v * v, 0));
    return dot / (normA * normB);
  }
  // 計算所有相似度，排序取前3
  const scored = contextChunks.map(chunk => ({
    chunk,
    sim: cosineSimilarity(queryEmbedding, chunk.embedding)
  }));
  scored.sort((a, b) => b.sim - a.sim);
  const top3 = scored.slice(0, 3);
  // 印出前三筆 debug
  console.log('--- 查詢相似度前3參考資料 ---');
  top3.forEach((item, idx) => {
    console.log(`#${idx+1} 相似度:`, item.sim);
    console.log(item.chunk.content);
    console.log('-----------------------------');
  });
  let mostRelevantChunk = top3[0].chunk;
  let maxSim = top3[0].sim;
  // fallback: 若最高分低於 0.6，則用關鍵字比對
  if (maxSim < 0.9) {
    // 斷詞：每個中文字、英數詞都單獨拆分，並產生 n-gram
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
      // 依每個關鍵字分組顯示命中資料
      const kwArr = Array.from(keywordSet);
      let grouped = [];
      kwArr.forEach((kw, idx) => {
        const hits = contextChunks.filter(chunk => chunk.content.includes(kw));
        if (hits.length > 0) {
          console.log(`【${kw}】命中${hits.length}筆`);
          hits.forEach((c, i) => {
            console.log(`  #${i+1}：`, c.content);
          });
          grouped.push(`【${kw}】\n` + hits.map(c => c.content).join('\n'));
        }
      });
      // 合併每個關鍵字命中內容，分段顯示
      mostRelevantChunk = { content: grouped.join('\n---\n') };
    } else {
      console.log('--- fallback 也沒命中任何資料 ---');
    }
  }
  // Step 4: 構造 Groq 的請求，正確傳遞 content 欄位
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
    // 檢查 Groq API 回傳格式
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
