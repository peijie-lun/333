import axios from 'axios';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { query } = req.body;
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid query' });
  }

  try {
    const response = await axios.post(`${process.env.BASE_URL}/api/grokmain`, { query });
    return res.status(200).json(response.data);
  } catch (error) {
    console.error('呼叫 grokmain API 失敗:', error.response?.data || error.message);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}