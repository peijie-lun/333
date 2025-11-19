import { Client } from '@line/bot-sdk';
import { getImageUrlsByKeyword, generateAnswer } from '../../../grokmain.js';

// ✅ 強制使用 Node.js Runtime
export const runtime = 'nodejs';

const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new Client(lineConfig);

export async function POST(req) {
  // 你的邏輯
}

export async function GET() {
  return new Response('Method Not Allowed', { status: 405 });
}
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