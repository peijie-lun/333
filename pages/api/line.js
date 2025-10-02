import { Client } from '@line/bot-sdk';
import { supabase } from '../../lib/supabaseClient';

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

  let body = '';
  req.on('data', chunk => {
    body += chunk;
  });

  req.on('end', async () => {
    try {
      const events = JSON.parse(body).events;

      await Promise.all(events.map(async (event) => {
        if (event.type === 'message' && event.message.type === 'text') {
          // 儲存訊息到 Supabase
          await supabase.from('messages').insert([
            {
              user_id: event.source.userId,
              message: event.message.text,
              timestamp: new Date().toISOString(),
            },
          ]);

          // 回覆訊息
          await client.replyMessage(event.replyToken, {
            type: 'text',
            text: `你說的是：${event.message.text}`,
          });
        }
      }));

      res.status(200).end();
    } catch (err) {
      console.error('Webhook error:', err);
      res.status(500).end();
    }
  });
}