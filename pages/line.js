import { Client, middleware } from '@line/bot-sdk';

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new Client(config);

export const configMiddleware = middleware(config);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).end();
    return;
  }

  const events = req.body.events;

  await Promise.all(events.map(async (event) => {
    if (event.type === 'message' && event.message.type === 'text') {
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: `你說的是：${event.message.text}`,
      });
    }
  }));

  res.status(200).end();
}