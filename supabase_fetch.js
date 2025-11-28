
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY; // 或改用 GROQ API

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('請在 .env 設定 SUPABASE_URL 和 SUPABASE_ANON_KEY');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const cachePath = path.join(process.cwd(), 'supabase_embeddings.json');

// ✅ Embedding function (OpenAI)
async function getEmbedding(text) {
  try {
    const response = await axios.post(
      'https://api.openai.com/v1/embeddings',
      {
        model: 'text-embedding-3-small',
        input: text
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data.data[0].embedding;
  } catch (error) {
    console.error('Embedding API 錯誤:', error.response?.data || error.message);
    return null;
  }
}

async function fetchAndCache(forceUpdate = false) {
  if (forceUpdate && fs.existsSync(cachePath)) {
    console.log('🔄 強制更新模式: 清除舊快取');
    fs.unlinkSync(cachePath);
  }

  // ✅ 預設 FAQ
  const defaultFaqs = [
    '本大樓禁止飼養寵物，違者將依規定處理。',
    '問：可以養寵物嗎？\n答：本大樓禁止飼養寵物，違者將依規定處理。',
    '問：垃圾要什麼時候丟？\n答：垃圾請於每日晚上八點至九點間丟置指定地點。',
    '問：停車場可以給訪客停車嗎？\n答：停車場僅供本社區住戶使用，外來車輛請勿停放。'
  ];

  // ✅ 查詢現有 FAQ
  const { data: existData, error: existError } = await supabase
    .from('knowledge')
    .select('content');
  if (existError) {
    console.error('Supabase 讀取 knowledge 失敗:', existError);
    return;
  }

  const existSet = new Set((existData || []).map(row => row.content));
  for (const faq of defaultFaqs) {
    if (!existSet.has(faq)) {
      await supabase.from('knowledge').insert({ content: faq });
      console.log('已補 FAQ：', faq);
    }
  }

  // ✅ 重新查詢最新 FAQ
  const { data, error } = await supabase.from('knowledge').select('id, content');
  if (error || !data || data.length === 0) {
    console.error('Supabase 讀取 knowledge 失敗:', error);
    return;
  }

  let cache = {};
  if (fs.existsSync(cachePath)) {
    try {
      cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    } catch {}
  }

  let updated = false;
  for (const row of data) {
    const key = String(row.id);
    if (!cache[key] || cache[key].content !== row.content) {
      const embedding = await getEmbedding(row.content);
      if (embedding) {
        cache[key] = { content: row.content, embedding };
        updated = true;
        console.log(`✅ 已更新 embedding: id=${key}`);
      }
    }
  }

  // ✅ 處理圖片資料
  const { data: imageData } = await supabase.from('images').select('id, url, description');
  if (imageData && imageData.length > 0) {
    for (const img of imageData) {
      const imgKey = `img_${img.id}`;
      const imgContent = `圖片: ${img.description || '無描述'}\nURL: ${img.url}`;
      if (!cache[imgKey] || cache[imgKey].content !== imgContent) {
        const embedding = await getEmbedding(imgContent);
        if (embedding) {
          cache[imgKey] = { content: imgContent, embedding, type: 'image', url: img.url };
          updated = true;
          console.log(`🖼️ 已加入圖片 embedding: ${imgKey}`);
        }
      }
    }
  }

  if (updated) {
    fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf-8');
    console.log('✅ supabase_embeddings.json 已更新');
  } else {
    console.log('✨ 所有 embedding 已是最新');
  }
}

const forceUpdate = process.argv.includes('--force');
fetchAndCache(forceUpdate);
  