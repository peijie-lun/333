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
          const userId = event.source.userId;
          const userText = event.message.text.trim();
          const replyToken = event.replyToken;

          let replyMessage = '';

          if (userText === '公告') {
            // 查詢最新公告
            const { data, error } = await supabase
              .from('announcements')
              .select('title, content, time')
              .eq('status', 'published')
              .order('time', { ascending: false })
              .limit(1);

            if (error) {
              console.error('Supabase query error:', error);
              replyMessage = '取得公告時發生錯誤，請稍後再試。';
            } else if (data.length === 0) {
              replyMessage = '目前沒有公告。';
            } else {
              const announcement = data[0];
              const formattedTime = new Date(announcement.time).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
              replyMessage = `📢 ${announcement.title}\n${announcement.content}\n🕒 發布時間：${formattedTime}`;
            }
          } else {
            // 儲存使用者訊息到 messages 表格
            const { error } = await supabase.from('messages').insert([
              {
                user_id: userId,
                text: userText,
                created_at: new Date(event.timestamp).toISOString(),
              },
            ]);

            if (error) {
              console.error('Supabase insert error:', error);
            }

            replyMessage = `你說的是：${userText}`;
          }

          // 回覆訊息
          await client.replyMessage(replyToken, [
            {
              type: 'text',
              text: replyMessage,
            },
          ]);
        }
      }));

      res.status(200).end();
    } catch (err) {
      console.error('Webhook error:', err);
      res.status(500).end();
    }
  });
}

