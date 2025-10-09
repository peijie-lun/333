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
  if (!query) {
    res.status(400).json({ error: 'Missing query' });
    return;
  }

  try {
    const { data: chunks, error } = await supabase
      .from('embeddings')
      .select('content, embedding');

    if (error || !chunks || chunks.length === 0) {
      res.status(500).json({ error: '無法取得 embedding 資料' });
      return;
    }

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
    const mostRelevantChunk = top3[0].chunk;

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

    const answer = response.data.choices[0].message.content;
    res.status(200).json({ answer });
  } catch (error) {
    console.error('LLM API error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
