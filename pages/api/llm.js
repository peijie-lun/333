
import { generateAnswer } from '../../grokmain';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { query } = req.body;
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'Invalid query' });
  }

  try {
    const result = await generateAnswer(query);

    if (result?.type === 'image') {
      return res.status(200).json({
        answer: '以下是相關圖片：',
        images: result.items.map(item => ({
          url: item.url,
          description: item.title || '社區圖片'
        }))
      });
    } else {
      return res.status(200).json({
        answer: result?.content || '目前沒有找到相關資訊，請查看社區公告。',
        images: []
      });
    }
  } catch (error) {
    console.error('LLM 查詢失敗:', error);
    return res.status(500).json({ error: 'LLM 查詢失敗' });
  }
}
