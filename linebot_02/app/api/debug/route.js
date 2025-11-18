export async function GET() {
  try {
    const response = await fetch('https://333-psi-seven.vercel.app/api/llm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '這是一個測試問題，請回覆測試成功。' }),
    });

    const result = await response.json();

    return new Response(
      JSON.stringify({
        message: 'LLM API 測試成功',
        answer: result.answer || '無回覆',
      }),
      { status: 200 }
    );
  } catch (error) {
    console.error('LLM API 測試失敗:', error);
    return new Response(
      JSON.stringify({ error: 'LLM API 測試失敗', details: error.message }),
      { status: 500 }
    );
  }
}