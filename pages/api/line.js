import { generateAnswer } from '../../lib/grokmain'; // 根據你的專案結構調整路徑
import axios from 'axios';

const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

export default async function handler(req, res) {
  // 確保只接受 POST 請求
  if (req.method !== 'POST') {
    console.log('❌ 非 POST 請求：', req.method);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const events = req.body.events;
  if (!events || events.length === 0) {
    console.log('⚠️ 沒有事件');
    return res.status(200).json({ message: 'No events to process' });
  }

  try {
    for (const event of events) {
      if (event.type !== 'message' || event.message.type !== 'text') continue;

      const userMessage = event.message.text;
      const replyToken = event.replyToken;

      console.log('📩 使用者訊息：', userMessage);

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

    // 成功處理，回傳 200 給 LINE 平台
    res.status(200).json({ message: 'OK' });
  } catch (error) {
    console.error('❌ LINE Webhook 處理錯誤：', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}