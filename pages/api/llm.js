import axios from 'axios';
import { supabase } from '../../lib/supabaseClient';

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

  try {
    // 直接抓全部 knowledge 資料
    const { data: knowledge, error } = await supabase
      .from('knowledge')
      .select('content');

    if (error || !knowledge || knowledge.length === 0) {
      console.error('Supabase 查詢錯誤:', error);
      res.status(500).json({ error: '無法取得知識資料' });
      return;
    }

    // 將所有 content 合併成一段參考資料
    const referenceText = knowledge.map(k => k.content).join('\n\n');

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

    const answer = response.data?.choices?.[0]?.message?.content?.trim();

    if (!answer) {
      res.status(200).json({ answer: '查詢失敗，請稍後再試。' });
      return;
    }

    res.status(200).json({ answer });
  } catch (error) {
    console.error('LLM API error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}