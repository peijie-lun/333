import fs from 'fs';
import path from 'path';
import axios from 'axios';

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });                  
    return;
  }

  const { query } = req.body;
  if (!query || typeof query !== 'string') {
    res.status(400).json({ error: 'Missing or invalid query' });
    return;
  }

  const cachePath = path.resolve('./supabase_embeddings.json');
  if (!fs.existsSync(cachePath)) {
    res.status(500).json({ error: '快取檔案不存在' });
    return;
  }

  const cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));

  // 🔍 關鍵字比對 content
  const matchedItems = Object.values(cache).filter(item =>
    item.content && item.content.includes(query)
  );

  const topItems = matchedItems.slice(0, 3);
  const referenceText = topItems.map(i => i.content).join('\n\n') || '（無相關資料）';

  // 🖼 擷取圖片 URL
  let imageUrl = null;
  for (const item of topItems) {
    const match = item.content.match(/https?:\/\/\S+\.(jpg|jpeg|png|webp)[^\s]*/i);
    if (match) {
      imageUrl = match[0];
      break;
    }
  }

  if (!imageUrl) {
    imageUrl = 'https://example.com/default.jpg';
  }

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

    let answer = response.data?.choices?.[0]?.message?.content?.trim();
    if (!answer || answer.length < 2) {
      answer = '目前沒有找到相關資訊，請查看社區公告。';
    }

    res.status(200).json({ answer, image: imageUrl });
  } catch (error) {
    console.error('LLM API error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}