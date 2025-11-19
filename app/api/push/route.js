import { Client } from '@line/bot-sdk';

// ✅ 強制使用 Node.js Runtime
export const runtime = 'nodejs';

const lineClient = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN
});

export async function POST(req) {
  try {
    const body = await req.json();
    const { title, content, image_url } = body;

    // ✅ 從 Supabase 抓取所有 userid
    const users = await fetch(`${process.env.SUPABASE_URL}/rest/v1/message?select=userid`, {
      headers: {
        apikey: process.env.SUPABASE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_KEY}`
      }
    }).then(r => r.json());

    if (!users || users.length === 0) {
      return new Response(JSON.stringify({ error: 'No LINE user IDs found in message table' }), { status: 400 });
    }

    const userIds = users.map(u => u.userid);

    // ✅ Flex Message
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

    // ✅ 推播給所有 userIds
    await lineClient.multicast(userIds, flexMessage);

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
  }
}