// ES module export for Next.js
export async function generateAnswer(query) {
  return await chat(query);
}
// grokmain.js - 使用 Supabase pgvector 版本
require('dotenv').config({ path: __dirname + '/.env' });

const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const { pipeline } = require('@xenova/transformers');

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama3-8b-8192';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 初始化 embedding 模型（第一次會下載模型）
let embeddingModel = null;

async function initEmbeddingModel() {
  if (!embeddingModel) {
    embeddingModel = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return embeddingModel;
}

// 生成 embedding 向量（使用 Transformers.js）
async function getEmbedding(text) {
  try {
    const model = await initEmbeddingModel();
    const output = await model(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
  } catch (error) {
    console.error('Error getting embedding:', error);
    return null;
  }
}

// 主要聊天函數
async function chat(query) {
  console.log(`\n[Query] 問題: ${query}`);
  
  // 1. 生成問題的 embedding
  const queryEmbedding = await getEmbedding(query);
  if (!queryEmbedding) {
    return { error: 'embedding 生成失敗' };
  }

  // 2. 使用 Supabase RPC 函數搜尋相似內容
  const { data: searchResults, error: searchError } = await supabase.rpc('search_knowledge', {
    query_embedding: queryEmbedding,
    match_threshold: 0.8,
    match_count: 5
  });

  if (searchError) {
    console.error('[Error] 搜尋失敗:', searchError);
    return { error: '搜尋失敗' };
  }

  let finalResults = searchResults;
  let maxSim = searchResults?.[0]?.similarity || 0;

  // 3. Fallback: 如果相似度太低,使用關鍵字搜尋
  if (!searchResults || searchResults.length === 0 || maxSim < 0.9) {
    console.log('[Fallback] 相似度不足,啟用關鍵字搜尋...');
    
    // 拆解關鍵字 (n-gram)
    const words = query.match(/[\u4e00-\u9fa5]|\w+/g) || [];
    let ngrams = [];
    for (let n = 1; n <= 3; n++) {
      for (let i = 0; i <= words.length - n; i++) {
        ngrams.push(words.slice(i, i + n).join(''));
      }
    }
    
    console.log(`[Keywords] ${ngrams.slice(0, 10).join(', ')}`);

    // 從資料庫用關鍵字搜尋
    const { data: allData } = await supabase
      .from('knowledge')
      .select('id, content')
      .not('embedding', 'is', null);

    if (allData) {
      const keywordMatches = allData.filter(item => 
        ngrams.some(kw => item.content.includes(kw))
      );

      console.log(`[Match] 關鍵字命中 ${keywordMatches.length} 筆`);
      
      if (keywordMatches.length > 0) {
        finalResults = keywordMatches.slice(0, 3).map((item, idx) => ({
          id: item.id,
          content: item.content,
          similarity: 0.5 - idx * 0.1  // 模擬相似度
        }));
      }
    }
  }

  if (!finalResults || finalResults.length === 0) {
    console.log('[Error] 找不到任何相關資料');
    return { answer: '抱歉，我找不到相關資料來回答這個問題。' };
  }

  // 4. 顯示搜尋結果
  console.log('\n[Results] 最終結果前 3 筆:');
  finalResults.slice(0, 3).forEach((item, idx) => {
    console.log(`\n#${idx + 1} 相似度: ${(item.similarity * 100).toFixed(2)}%`);
    console.log(`內容: ${item.content.substring(0, 100)}...`);
  });

  // 5. 組合上下文
  const context = finalResults
    .slice(0, 3)
    .map(item => item.content)
    .join('\n\n---\n\n');

  // 5. 搜尋相關圖片
  const { data: imageResults } = await supabase.rpc('search_images', {
    query_embedding: queryEmbedding,
    match_threshold: 0.6,
    match_count: 3
  });

  const images = imageResults?.map(img => img.url) || [];
  if (images.length > 0) {
    console.log(`\n[Images] 找到 ${images.length} 張相關圖片`);
  }

  // 6. 呼叫 Groq API 生成回答
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
            content: `問題：${query}\n\n參考資料：\n${context}`
          }
        ],
        temperature: 0.3
      },
      {
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`
        }
      }
    );

    const answer = typeof response.data.choices[0].message.content === 'string'
      ? response.data.choices[0].message.content
      : '無法生成回答';
    console.log(`\n[Answer] 回答:\n${answer}\n`);

    return {
      answer,
      images,
      sources: searchResults.slice(0, 3)
    };
  } catch (error) {
    console.error('[Error] Groq API 錯誤:', error.response?.data || error.message);
    return { error: 'AI 回答生成失敗' };
  }
}

// 測試用 (可刪除)
if (require.main === module) {
  chat('可不可以養寵物?').then(() => {
    process.exit(0);
  });
}

module.exports = { chat, generateAnswer: chat };
