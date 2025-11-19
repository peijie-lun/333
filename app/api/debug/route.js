import { Client } from '@line/bot-sdk';
import { getImageUrlsByKeyword, generateAnswer } from '../../../grokmain.js';

// ✅ 強制使用 Node.js Runtime
export const runtime = 'nodejs';

const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new Client(lineConfig);

// ✅ 如果不需要 POST，可以刪掉，否則加上邏輯
export async function POST(req) {
  return new Response('POST not implemented', { status: 501 });
}

// ✅ GET：測試 LLM API
export async function GET() {
  try {
    const apiUrl = process.env.VERCEL_URL
      ? `${process.env.VERCEL_URL}/api/llm`
      : 'http://localhost:3000/api/llm';

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '這是一個測試問題，請回覆測試成功。' }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(
        JSON.stringify({ error: 'LLM API 回應錯誤', details: errorText }),
        { status: 500 }
      );
    }

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