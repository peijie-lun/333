
import fs from 'fs';
import path from 'path';
import axios from 'axios';

export const runtime = 'nodejs';

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL;

export async function POST(req) {
  try {
    const body = await req.json();
    // 轉送到 /api/chat
    const apiUrl = 'http://localhost:3000/api/chat'; // 若有不同 port 或 domain 請自行調整
    try {
      const response = await axios.post(apiUrl, body, {
        headers: { 'Content-Type': 'application/json' }
      });
      return new Response(JSON.stringify(response.data), { status: response.status });
    } catch (error) {
      const errMsg = error.response?.data || error.message;
      return new Response(JSON.stringify({ error: 'API chat 錯誤', detail: errMsg }), { status: 500 });
    }
  } catch (error) {
    console.error('LLM API error:', error.message);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
  }
}
