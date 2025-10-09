export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    const response = await fetch('https://333-psi-seven.vercel.app/api/llm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '這是一個測試問題，請回覆測試成功。' }),
    });

    const result = await response.json();

    res.status(200).json({
      message: 'LLM API 測試成功',
      answer: result.answer || '無回覆',
    });
  } catch (error) {
    console.error('LLM API 測試失敗:', error);
    res.status(500).json({ error: 'LLM API 測試失敗', details: error.message });
  }
}