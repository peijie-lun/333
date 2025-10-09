const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/llm`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: userText }),
});
const result = await response.json();
replyMessage = result.answer || '查詢失敗，請稍後再試。';        