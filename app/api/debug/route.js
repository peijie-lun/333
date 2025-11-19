import { Client } from '@line/bot-sdk';

export const runtime = 'nodejs';

const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new Client(lineConfig);

// ❌ 不能 import grokmain.js
// ❌ 不要用 getImageUrlsByKeyword, generateAnswer 這種 heavy code

export async function POST(req) {
  return new Response('POST not implemented', { status: 501 });
}

export async function GET() {
  try {
    const apiUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}/api/llm`
      : 'http://localhost:3000/api/llm';

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "這是一個測試問題，請回覆測試成功。"
      })
    });

    const result = await response.json();

    return Response.json({
      message: "LLM API 測試成功",
      answer: result.answer || "無回覆"
    });
  } catch (error) {
    console.error("LLM API 測試失敗:", error);

    return Response.json({
      error: "LLM API 測試失敗",
      details: error.message
    }, { status: 500 });
  }
}
