

import { chat } from '../../../grokmain.js';

export async function POST(req) {
  try {
    const { query } = await req.json();
    if (!query) {
      return new Response(JSON.stringify({ error: '缺少 query 參數' }), { status: 400 });
    }
    const result = await chat(query);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
