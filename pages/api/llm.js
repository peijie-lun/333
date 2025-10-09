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
    const { data: chunks, error } = await supabase
      .from('embeddings')
      .select('content, embedding');

    if (error) {
      console.error('Supabase 查詢錯誤:', error);
      res.status(500).json({ error: '無法取得 embedding 資料' });
      return;
    }

    if (!chunks || chunks.length === 0) {
      console.warn('Supabase 沒有取得任何資料');
      res.status(500).json({ error: '無法取得 embedding 資料' });
      return;
    }

    console.log('取得的 chunks 數量:', chunks.length);

    const queryEmbedding = new Array(chunks[0].embedding.length).fill(0.5);

    function cosineSimilarity(a, b) {
      const dot = a.reduce((sum, v, i) => sum + v * b[i], 0);
      const normA = Math.sqrt(a.reduce((sum, v) => sum + v * v, 0));
      const normB = Math.sqrt(b.reduce((sum, v) => sum + v * v, 0));
      return dot / (normA * normB);
    }

    const scored = chunks.map(chunk => ({
      chunk,
      sim: cosineSimilarity(queryEmbedding, chunk.embedding),
    }));

    scored.sort((a, b) => b.sim - a.sim);
    const top3 = scored.slice(0, 3);
    const mostRelevantChunk = top3[0]?.chunk;

    if (!mostRelevantChunk || !mostRelevantChunk.content) {
      console.warn('找不到最相關的 chunk');
      res.status(500).json({ error: '無法取得有效的參考資料' });
      return;
    }

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

    console.log('GROQ 回應:', response.data);

    const answer = response.data?.choices?.[0]?.message?.content?.trim();

    if (!answer) {
      console.warn('GROQ 回傳空內容');
      res.status(200).json({ answer: '查詢失敗，請稍後再試。' });
      return;
    }

    res.status(200).json({ answer });
  } catch (error) {
    console.error('LLM API error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}