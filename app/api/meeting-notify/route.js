
import { NextResponse } from 'next/server';

import line from '@line/bot-sdk';

// 你的 LINE Channel Access Token
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
// 你要推播的 userId 或 groupId，請自行填入
const LINE_TARGET_ID = process.env.LINE_TARGET_ID;

export async function POST(req) {
  try {
    const data = await req.json();
    const { topic, time, location, key_takeaways, notes, pdf_file_url, created_by } = data;
    if (!topic || !time || !location || !key_takeaways) {
      return NextResponse.json({ error: '缺少必要欄位' }, { status: 400 });
    }

    // 寫入 meetings table
    const { data: meeting, error: meetingError } = await supabase
      .from('meetings')
      .insert([
        {
          topic,
          time,
          location,
          key_takeaways,
          notes: notes || '',
          pdf_file_url: pdf_file_url || '',
          created_by: created_by || null,
        },
      ])
      .select()
      .single();
    if (meetingError) {
      return NextResponse.json({ error: '資料庫寫入失敗', detail: meetingError.message }, { status: 500 });
    }

    // 組合 Flex Message
    const flexMessage = {
      type: 'flex',
      altText: '會議公告',
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            { type: 'text', text: '📢 會議公告', weight: 'bold', size: 'lg' },
            { type: 'text', text: topic, weight: 'bold', size: 'md', margin: 'md' },
          ],
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            { type: 'box', layout: 'baseline', contents: [ { type: 'text', text: '🕒', size: 'sm' }, { type: 'text', text: String(time), size: 'sm', margin: 'sm' } ] },
            { type: 'box', layout: 'baseline', contents: [ { type: 'text', text: '📍', size: 'sm' }, { type: 'text', text: location, size: 'sm', margin: 'sm' } ] },
            { type: 'separator', margin: 'md' },
            { type: 'text', text: '📌 重點摘要', weight: 'bold', size: 'sm', margin: 'md' },
            ...(Array.isArray(key_takeaways) ? key_takeaways.map(t => ({ type: 'text', text: t, size: 'sm', wrap: true })) : []),
            notes ? { type: 'text', text: `備註：${notes}`, size: 'sm', wrap: true, margin: 'md' } : null,
            pdf_file_url ? { type: 'button', action: { type: 'uri', label: '下載 PDF', uri: pdf_file_url }, style: 'primary', margin: 'md' } : null,
          ].filter(Boolean),
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          contents: [
            { type: 'button', action: { type: 'uri', label: '👉 查看詳情', uri: '#' }, style: 'link' },
          ],
        },
      },
    };

    // 初始化 LINE client
    const client = new line.Client({
      channelAccessToken: LINE_CHANNEL_ACCESS_TOKEN,
    });

    // 廣播 Flex Message
    await client.broadcast(flexMessage);

    return NextResponse.json({ success: true, meeting });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
