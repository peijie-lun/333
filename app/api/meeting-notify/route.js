
import * as line from '@line/bot-sdk';

import { NextResponse } from 'next/server';


import { supabase } from '../../../supabaseClient';

// 你的 LINE Channel Access Token
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
// 你要推播的 userId 或 groupId，請自行填入
const LINE_TARGET_ID = process.env.LINE_TARGET_ID;

export async function POST(req) {
  try {
    const data = await req.json();// 取得請求中的 JSON 資料 // 解析請求中的 JSON 資料
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
    // Flex Message 內容陣列，過濾掉 null/undefined
    const bodyContents = [
      { type: 'box', layout: 'baseline', contents: [ { type: 'text', text: '🕒', size: 'sm', flex: 0 }, { type: 'text', text: String(time), size: 'sm', margin: 'sm', flex: 1 } ] },
      { type: 'box', layout: 'baseline', contents: [ { type: 'text', text: '📍', size: 'sm', flex: 0 }, { type: 'text', text: location, size: 'sm', margin: 'sm', flex: 1 } ] },
      { type: 'separator', margin: 'md' },
      { type: 'text', text: '📌 重點摘要', weight: 'bold', size: 'sm', margin: 'md' },
      ...(Array.isArray(key_takeaways) ? key_takeaways.map(t => t ? { type: 'text', text: t, size: 'sm', wrap: true } : null) : []),
      notes ? { type: 'text', text: `備註：${notes}`, size: 'sm', wrap: true, margin: 'md' } : null,
      pdf_file_url ? { type: 'button', action: { type: 'uri', label: '下載 PDF', uri: pdf_file_url }, style: 'primary', margin: 'md' } : null,
    ].filter(Boolean);

    const detailUrl = pdf_file_url && typeof pdf_file_url === 'string' && pdf_file_url.startsWith('http') ? pdf_file_url : 'https://line.me';
    const flexMessage = {
      type: 'flex',
      altText: '會議公告',
      contents: {
        type: 'bubble',
        size: 'mega',
        header: {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#1976d2',
          paddingAll: '16px',
          contents: [
            { type: 'text', text: '會議公告', weight: 'bold', size: 'xl', color: '#fff', align: 'center', margin: 'none' },
            { type: 'text', text: String(topic).slice(0, 40), weight: 'bold', size: 'md', color: '#fff', align: 'center', margin: 'md' },
          ],
        },
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'md',
          contents: [
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: '🕒', size: 'sm', flex: 0 },
                { type: 'text', text: String(time), size: 'sm', color: '#1976d2', flex: 1, margin: 'sm' },
              ],
            },
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: '📍地點', size: 'sm', flex: 0 },
                { type: 'text', text: location, size: 'sm', color: '#1976d2', flex: 1, margin: 'sm' },
              ],
            },
            { type: 'separator', margin: 'md' },
            { type: 'text', text: '📌 重點摘要', weight: 'bold', size: 'sm', color: '#1976d2', margin: 'md' },
            ...(Array.isArray(key_takeaways) ? key_takeaways.filter(Boolean).map(t => ({ type: 'text', text: t, size: 'sm', wrap: true, margin: 'sm' })) : []),
            ...(notes ? [{ type: 'text', text: `備註：${notes}`, size: 'sm', wrap: true, color: '#666', margin: 'md' }] : []),
            ...(pdf_file_url ? [{ type: 'button', action: { type: 'uri', label: '下載 PDF', uri: pdf_file_url }, style: 'primary', color: '#1976d2', margin: 'md' }] : []),
          ].slice(0, 10),
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          contents: [
            { type: 'button', action: { type: 'uri', label: '👉 查看詳情', uri: detailUrl }, style: 'link', color: '#1976d2' }, //之後可以放我們系統部上去vercel的網址

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
