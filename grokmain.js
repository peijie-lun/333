import fs from 'fs';
import path from 'path';
import axios from 'axios';
import 'dotenv/config'; // 自動讀取根目錄 .env

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const GROQ_EMBED_MODEL = process.env.GROQ_EMBED_MODEL || "nomic-embed-text-v2"; // 新增

// Vercel 上沒有 __dirname，要用 process.cwd()
const ROOT_DIR = process.cwd();
const CACHE_PATH = path.join(ROOT_DIR, 'lib/supabase_embeddings.json');
const SUPABASE_FETCH = path.join(ROOT_DIR, 'lib/supabase_fetch.js');

// 可選自動同步
const USE_AUTO_SYNC = process.env.USE_AUTO_SYNC === 'true';
if (USE_AUTO_SYNC) {
  import('./supabase_auto_sync.js').then(mod => {
    mod.startAutoSync()
      .then(() => console.log('✅ 自動同步已啟動'))
      .catch(err => console.error('❌ 自動同步啟動失敗:', err));
  });
}

// 初始快取檢查
if (!fs.existsSync(CACHE_PATH)) {
  console.log('⚠️ 快取不存在, 執行初始載入...');
  import('./supabase_fetch.js').then(mod => mod.default());
} else {
  console.log('✅ 使用現有快取');
}

/* ---------------------------------------------------
 *  方案 A：使用 Groq Embedding API（取代 Python）
 * --------------------------------------------------- */
export async function getEmbedding(text) {
  try {
    const response = await axios.post(
      "https://api.groq.com/openai/v1/embeddings",
      {
        model: GROQ_EMBED_MODEL,
        input: text,
      },
      {
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
        },
      }
    );

    const embedding =
      response?.data?.data?.[0]?.embedding || null;

    if (!embedding) {
      console.error("❌ Groq embedding API 無回傳資料:", response.data);
      return null;
    }

    return embedding;
  } catch (err) {
    console.error("❌ Groq embedding API 錯誤:", err.response?.data || err);
    return null;
  }
}

/* ---------------------------------------------------
 *  主要 QA 流程
 * --------------------------------------------------- */
export async function generateAnswer(query) {
  console.log("🔍 正在產生 embedding:", query);

  const queryEmbedding = await getEmbedding(query);
  if (!queryEmbedding) {
    console.error('查詢向量生成失敗');
    return '查詢失敗（embedding 失敗）';
  }

  // 讀取快取
  if (!fs.existsSync(CACHE_PATH)) {
    return "找不到 supabase_embeddings.json，請先執行 supabase_fetch.js";
  }

  let cache = {};
  try {
    cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
  } catch {
    return "supabase_embeddings.json 解析失敗";
  }

  const contextChunks = Object.values(cache);
  if (contextChunks.length === 0) {
    return "embedding 快取為空";
  }

  /* ----------------------------
   *  Cosine Similarity
   * ---------------------------- */
  function cosineSimilarity(a, b) {
    const dot = a.reduce((sum, v, i) => sum + v * b[i], 0);
    const normA = Math.sqrt(a.reduce((sum, v) => sum + v * v, 0));
    const normB = Math.sqrt(b.reduce((sum, v) => sum + v * v, 0));
    return dot / (normA * normB);
  }

  const scored = contextChunks.map(chunk => ({
    chunk,
    sim: cosineSimilarity(queryEmbedding, chunk.embedding),
  }));

  scored.sort((a, b) => b.sim - a.sim);
  const top3 = scored.slice(0, 3);

  console.log("📌 查詢相似度前 3：");
  top3.forEach((item, idx) => {
    console.log(`#${idx + 1} sim=${item.sim}`);
    console.log(item.chunk.content);
    console.log("------------------------------");
  });

  let mostRelevantChunk = top3[0].chunk;
  const maxSim = top3[0].sim;

  /* ---------------------------------------------------
   *  Fallback：關鍵字比對
   * --------------------------------------------------- */
  if (maxSim < 0.9) {
    const words = query.match(/[\u4e00-\u9fa5]|\w+/g) || [];

    // 產生 uni-gram / bi-gram / tri-gram
    const ngrams = [];
    for (let n = 1; n <= 3; n++) {
      for (let i = 0; i <= words.length - n; i++) {
        ngrams.push(words.slice(i, i + n).join(''));
      }
    }

    const keywordSet = new Set(ngrams);
    console.log("🔎 fallback 關鍵字：", [...keywordSet]);

    const fallbackChunks = contextChunks.filter(chunk =>
      [...keywordSet].some(kw => chunk.content.includes(kw))
    );

    if (fallbackChunks.length > 0) {
      let grouped = [];
      [...keywordSet].forEach(kw => {
        const hits = contextChunks.filter(c => c.content.includes(kw));
        if (hits.length > 0) {
          grouped.push(`【${kw}】\n` + hits.map(c => c.content).join("\n"));
        }
      });
      mostRelevantChunk = { content: grouped.join("\n---\n") };
    }
  }

  /* ---------------------------------------------------
   *  最後：呼叫 Groq LLM
   * --------------------------------------------------- */
  try {
    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: GROQ_MODEL,
        messages: [
          {
            role: "system",
            content:
              "你是檢索增強型助理，回答一律使用繁體中文，只能根據參考資料回答，不可補充或推測任何未在參考資料中的內容。即使相關度低，也請根據參考資料盡量回答。",
          },
          {
            role: "user",
            content: `問題：${query}\n\n參考資料：${mostRelevantChunk.content}`,
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
        },
      }
    );

    const answer = response.data?.choices?.[0]?.message?.content;
    return answer || "查詢失敗（Groq 回傳異常）";
  } catch (err) {
    console.error("Groq API 錯誤:", err.response || err);
    return "查詢失敗（Groq API 錯誤）";
  }
}

/* ---------------------------------------------------
 *  測試查詢
 * --------------------------------------------------- */
generateAnswer("可不可以養寵物?").then(console.log);
