
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import { fileURLToPath } from 'url';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const USE_AUTO_SYNC = process.env.USE_AUTO_SYNC === 'true';
if (USE_AUTO_SYNC) {
  const { startAutoSync } = await import('./supabase_auto_sync.js');
  startAutoSync()
    .then(() => console.log('✅ 自動同步已啟動'))
    .catch(err => console.error('❌ 自動同步啟動失敗:', err));
}

const cachePath = path.join(__dirname, 'supabase_embeddings.json');
if (!fs.existsSync(cachePath)) {
  console.log('⚠️ 快取不存在,執行初始載入...');
  const supabasePath = path.join(__dirname, 'supabase_fetch.js');
  const { spawnSync } = await import('child_process');
  const supabaseResult = spawnSync('node', [supabasePath], { stdio: 'inherit' });
  if (supabaseResult.error || supabaseResult.status !== 0) {
    console.error('❌ 執行 supabase_fetch.js 失敗');
  }
} else {
  console.log('✅ 使用現有快取');
}


const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL;



// --------------------------------
// Main Answer Function (Groq only)
// --------------------------------
async function generateAnswer(query) {
  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: GROQ_MODEL,
        messages: [
          {
            role: "system",
            content:
              "你是檢索增強型助理，回答一律使用繁體中文，只能根據參考資料回答，不可補充或推測任何未在參考資料中的內容。"
          },
          {
            role: "user",
            content: `問題：${query}`
          }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`
        }
      }
    );

    if (response.data?.choices?.[0]?.message?.content) {
      console.log('Answer:', response.data.choices[0].message.content);
      return response.data.choices[0].message.content;
    } else {
      console.error('Groq API 回傳格式異常:', response.data);
    }
  } catch (error) {
    console.error('Groq API 錯誤:', error.response?.data || error.message);
  }
}

// ✅ 雙模式匯出
export { generateAnswer };
export default generateAnswer;
if (typeof module !== 'undefined') {
  module.exports = { generateAnswer };
}
