
import fs from 'fs';
import path from 'path';
import axios from 'axios';

export const runtime = 'nodejs';

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL;

export async function POST(req) {
  try {
    const body = await req.json();
    const { query } = body;

    // ✅ 驗證輸入
    if (!query || typeof query !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing or invalid query' }), { status: 400 });
    }

    // ✅ 驗證 API Key
    if (!GROQ_API_KEY || !GROQ_MODEL) {
      return new Response(JSON.stringify({ error: 'Groq API Key 或 Model 未設定' }), { status: 500 });
    }

    // ✅ 檢查快取檔案
    const cachePath = path.join(process.cwd(), 'supabase_embeddings.json');
    if (!fs.existsSync(cachePath)) {
      return new Response(JSON.stringify({ error: '快取檔案不存在，請先執行資料同步。' }), { status: 500 });
    }

    const cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    const contextChunks = Object.values(cache);

    if (contextChunks.length === 0) {
      return new Response(JSON.stringify({ error: '快取資料為空' }), { status: 500 });
    }

    // ✅ 關鍵字比對（簡單檢索）
    const matchedItems = contextChunks.filter(item =>
      item.content && item.content.includes(query)
    );

    const topItems = matchedItems.slice(0, 3);
    const referenceText = topItems.map(i => i.content).join('\n\n') || '（無相關資料）';

    // ✅ 擷取圖片 URL（第一張）
    let imageUrl = null;
    for (const item of topItems) {
      const match = item.content.match(/https?:\/\/\S+\.(jpg|jpeg|png|webp)[^\s]*/i);
      if (match) {
        imageUrl = match[0];
        break;
      }
    }
    if (!imageUrl) {
      imageUrl = 'https://your-default-image-url.com/default.jpg'; // ✅ 改成你的預設圖片
    }

    // ✅ 呼叫 Groq API
    let answer = '目前沒有找到相關資訊，請查看社區公告。';
    try {
      const response = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: GROQ_MODEL,
          messages: [
            {
              role: 'system',
              content: '你是檢索增強型助理，回答一律使用繁體中文，只能根據參考資料回答。',
            },
            {
              role: 'user',
              content: `問題：${query}\n\n參考資料：${referenceText}`,
            },
          ],
        },
        {
          headers: {
            Authorization: `Bearer ${GROQ_API_KEY}`,
          },
        }
      );

      answer = response.data?.choices?.[0]?.message?.content?.trim() || answer;
    } catch (error) {
      console.error('Groq API 錯誤:', error.response?.data || error.message);
    }

    return new Response(JSON.stringify({ answer, image: imageUrl }), { status: 200 });
  } catch (error) {
    console.error('LLM API error:', error.message);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
  }
}
