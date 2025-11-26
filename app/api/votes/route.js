
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// 初始化 Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// POST: 新增投票並推播到 LINE
export async function POST(req) {
  try {
    const body = await req.json();
    const { title, description, ends_at, author, options } = body;

    // 驗證必要欄位
    if (!title || !author || !ends_at) {
      return NextResponse.json({ error: '缺少必要欄位' }, { status: 400 });
    }

    // 插入 Supabase votes 表
    const { data, error } = await supabase
      .from('votes')
      .insert([
        {
          title,
          description,
          ends_at,
          author,
          options: options || ['同意', '反對', '棄權']
        }
      ])
      .select()
      .single();

    if (error) {
      console.error('Supabase 插入錯誤:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 推播到 LINE（固定使用者 ID）
    await sendLinePush(data);

    return NextResponse.json({ success: true, vote: data }, { status: 200 });
  } catch (err) {
    console.error('API 錯誤:', err);
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 });
  }
}

// 推播到 LINE Bot
async function sendLinePush(vote) {
  const message = {
    to: 'U5dbd8b5fb153630885b656bb5f8ae011', // 固定推播到這個使用者 ID
    messages: [
      {
        type: 'flex',
        altText: '新的投票已發布',
        contents: {
          type: 'bubble',
          body: {
            layout: 'vertical',
            contents: [
              { type: 'text', text: '📢 新的投票', weight: 'bold', size: 'lg' },
              { type: 'text', text: `標題：${vote.title}`, wrap: true },
              {
                type: 'text',
                text: `截止時間：${new Date(vote.ends_at).toLocaleString()}`,
                size: 'sm',
                color: '#999999'
              }
            ]
          },
          footer: {
            layout: 'vertical',
            contents: [
              {
                type: 'button',
                style: 'primary',
                action: {
                  type: 'uri',
                  label: '立即投票',
                  uri: `${process.env.VOTE_PAGE_URL}/${vote.id}`
                }
              }
            ]
          }
        }
      }
    ]
  };

  await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`
    },
    body: JSON.stringify(message)
  });
}
