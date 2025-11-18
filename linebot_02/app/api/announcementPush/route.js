import { Client } from '@line/bot-sdk';
import { createClient } from '@supabase/supabase-js';

// 初始化 Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// 初始化 LINE Bot SDK
const lineClient = new Client({                                                      
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN
});

export async function POST(req) {
  try {
    const body = await req.json();
    const { title, content, image_url, author } = body;

    if (!title || !content) {
      return new Response(JSON.stringify({ error: 'Title and content are required' }), { status: 400 });
    }

    // ✅ 1. 儲存公告到 Supabase
    const { data, error } = await supabase.from('announcements').insert([
      {
        title,
        content,
        image_url: image_url || 'https://example.com/default-banner.jpg',
        author: author || '系統',
        status: 'published',
        created_at: new Date().toISOString()
      }
    ]);

    if (error) {
      console.error('Supabase insert error:', error);
      return new Response(JSON.stringify({ error: 'Failed to save announcement' }), { status: 500 });
    }

    // ✅ 2. 從 Supabase 抓取所有 userid
    const { data: users, error: userError } = await supabase.from('message').select('userid');

    if (userError || !users || users.length === 0) {
      return new Response(JSON.stringify({ error: 'No LINE user IDs found' }), { status: 400 });
    }

    const userIds = users.map(u => u.userid);

    // ✅ 3. 準備 Flex Message
    const flexMessage = {
      type: 'flex',
      altText: '📢 最新公告',
      contents: {
        type: 'bubble',
        hero: {
          type: 'image',
          url: image_url || 'https://example.com/default-banner.jpg',
          size: 'full',
          aspectRatio: '20:13',
          aspectMode: 'cover'
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: `📢 ${title}`,
              weight: 'bold',
              size: 'xl'
            },
            {
              type: 'text',
              text: content,
              wrap: true,
              margin: 'md'
            },
            {
              type: 'text',
              text: `發布時間：${new Date().toLocaleString()}`,
              size: 'xs',
              color: '#999999',
              margin: 'md'
            }
          ]
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'button',
              style: 'primary',
              action: {
                type: 'uri',
                label: '查看完整公告',
                uri: 'https://你的系統網址/announcement'
              }
            }
          ]
        }
      }
    };

    // ✅ 4. 推播給所有 userIds
    await lineClient.multicast(userIds, flexMessage);

    return new Response(JSON.stringify({ success: true, announcement: data }), { status: 200 });
  } catch (err) {
    console.error('Error:', err);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
  }
}