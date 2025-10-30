// pages/api/llm.js

import { generateAnswer } from '../../grokmain'; // 確保 grokmain.js 有 export generateAnswer

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { query } = req.body;
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Invalid query' });
    }

    const result = await generateAnswer(query);

    // 預設回傳格式
    const responsePayload = {
      answer: '',
      images: []
    };

    if (result?.type === 'image') {
      // 圖片查詢結果
      responsePayload.answer = '以下是相關圖片：';
      responsePayload.images = result.items.map(item => ({
        url: item.url,
        description: item.title || '社區圖片'
      }));
    } else {
      // 一般文字查詢結果
      responsePayload.answer = result?.content || '目前沒有找到相關資訊，請查看社區公告。';
    }

    res.status(200).json(responsePayload);
  } catch (error) {
    console.error('LLM 查詢失敗:', error);
    res.status(500).json({ error: 'LLM 查詢失敗' });
  }
}
