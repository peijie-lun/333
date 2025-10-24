import { Client } from '@line/bot-sdk';
import { createClient } from '@supabase/supabase-js';

const lineClient = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const { title, description, imageUrl, link } = req.body;

  // 從 Supabase 抓出所有 userid
  const { data: users, error } = await supabase
    .from('message')
    .select('userid')
    .neq('userid', null);

  if (error) {
    console.error('Supabase 查詢失敗:', error);
    return res.status(500).json({ error: 'Supabase 查詢失敗' });
  }

  // 建立 Flex Message 卡片
  const flexMessage = {
    type: 'flex',
    altText: title,
    contents: {
      type: 'bubble',
      hero: {
        type: 'image',
        url: imageUrl,
        size: 'full',
        aspectRatio: '20:13',
        aspectMode: 'cover'
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          {
            type: 'text',
            text: title,
            weight: 'bold',
            size: 'xl',
            color: '#1DB446'
          },
          {
            type: 'text',
            text: description,
            wrap: true,
            color: '#555555',
            size: 'sm'
          }
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#1DB446',
            action: {
              type: 'uri',
              label: '查看詳細公告',
              uri: link
            }
          }
        ]
      }
    }
  };

  // 推播給所有使用者
  try {
    for (const { userid } of users) {
      await lineClient.pushMessage(userid, flexMessage);
    }
    res.status(200).json({ success: true });
  } catch (err) {
    console.error('推播失敗:', err);
    res.status(500).json({ error: '推播失敗' });
  }
}