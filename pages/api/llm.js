import { generateAnswer } from '../../grokmain.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { query } = req.body;
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid query' });
  }

  try {
    const { answer, image } = await generateAnswer(query);
    return res.status(200).json({ answer, image });
  } catch (error) {
    console.error('Error in llm handler:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}