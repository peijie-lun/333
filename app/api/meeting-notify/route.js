
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



    // 進一步優化訊息格式
    let message =
      `📢 會議公告\n` +
      `====================\n` +
      `主題：${topic}\n` +
      `🕒 時間：${time}\n` +
      `📍 地點：${location}\n`;

    if (Array.isArray(key_takeaways) && key_takeaways.length > 0) {
      message += `\n--------------------\n📌 重點摘要\n` + key_takeaways.map((t) => `・${t}`).join('\n');
    }
    if (notes) message += `\n--------------------\n📝 備註\n${notes}`;
    if (pdf_file_url) message += `\n--------------------\n📄 PDF下載\n${pdf_file_url}`;

    message += `\n====================`;


    // 初始化 LINE client（只宣告一次）
    let client;
    if (!global._lineClient) {
      global._lineClient = new line.Client({
        channelAccessToken: LINE_CHANNEL_ACCESS_TOKEN,
      });
    }
    client = global._lineClient;

    // 廣播純文字訊息
    await client.broadcast({ type: 'text', text: message });
    return NextResponse.json({ message: '會議通知已發送' });
  } catch (error) {
    console.error('Error in meeting notify:', error);
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 });
  }}
