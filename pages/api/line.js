import { Client } from '@line/bot-sdk';

const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new Client(lineConfig);

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  try {
    const buffers = [];
    for await (const chunk of req) {
      buffers.push(chunk);
    }
    const body = Buffer.concat(buffers).toString();
    const events = JSON.parse(body).events;

    for (const event of events) {
      if (event.type === 'message' && event.message.type === 'text') {
        const userText = event.message.text.trim();
        const replyToken = event.replyToken;

        let replyMessage = '';

        try {
          const response = await fetch('https://333-psi-seven.vercel.app/api/llm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: userText }),
          });

          const result = await response.json();
          replyMessage = result.answer?.trim() || '查詢失敗，請稍後再試。';
        } catch (err) {
          console.error('查詢 LLM API 失敗:', err);
          replyMessage = '查詢失敗，請稍後再試。';
        }

        // 防止空訊息導致 LINE API 回傳 400
        if (replyMessage && replyToken) {
          try {
            await client.replyMessage(replyToken, [
              {
                type: 'text',
                text: replyMessage,
              },
            ]);
          } catch (err) {
            console.error('LINE 回覆訊息失敗:', err);
          }
        } else {
          console.warn('無效的 replyMessage 或 replyToken，略過回覆。');
        }
      }
    }

    res.status(200).end();
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).end();
  }
}