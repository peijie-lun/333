// pages/api/llm.js
import { generateAnswer } from '../../lib/grokmain'; // 根據你的專案結構調整路徑
import axios from 'axios';

const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const events = req.body.events;
  if (!events || events.length === 0) return res.status(200).end();

  for (const event of events) {
    if (event.type !== 'message' || event.message.type !== 'text') continue;

    const userMessage = event.message.text;
    const replyToken = event.replyToken;

    // 呼叫你已經寫好的查詢邏輯
    const result = await generateAnswer(userMessage);

    let messages = [];

    if (result.type === 'text') {
      messages.push({ type: 'text', text: result.content });
    } else if (result.type === 'image') {
      for (const item of result.items) {
        messages.push({
          type: 'image',
          originalContentUrl: item.url,
          previewImageUrl: item.url
        });
      }
    }

    // 回傳給 LINE 使用者
    await axios.post(
      'https://api.line.me/v2/bot/message/reply',
      {
        replyToken,
        messages
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
        }
      }
    );
  }

  res.status(200).end();
}