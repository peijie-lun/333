
import { Client } from '@line/bot-sdk';
import { supabase } from '../../../supabaseClient';

const client = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
});

export async function POST(req) {
  const { type, visitorName, time, location, visitorId } = await req.json();

  let message = '';
  switch (type) {
    case 'reservation':
      message = `👤【訪客預約成功】\n訪客：${visitorName}\n到訪時間：${time}\n\n📌 訪客到達時，管理室將通知您`;
      break;
    case 'checkin':
      message = `🔔【訪客已到達】\n您的訪客 ${visitorName} 已於 ${time} 完成簽到\n\n地點：${location}`;
      break;
    case 'checkout':
      message = `✅【訪客已離場】\n訪客 ${visitorName}\n離場時間：${time}\n\n感謝您的配合`;
      break;
    default:
      return new Response('Invalid notification type', { status: 400 });
  }

  // 查詢 visitor 對應的 reserved_by_id 的 line_user_id
  const { data, error } = await supabase
    .from('visitors')
    .select('reserved_by_id, profiles:reserved_by_id(line_user_id)')
    .eq('id', visitorId)
    .single();

  if (error || !data?.profiles?.line_user_id) {
    return new Response('找不到使用者 line_user_id', { status: 404 });
  }

  try {
    await client.pushMessage(data.profiles.line_user_id, { type: 'text', text: message });
    return new Response('Notification sent', { status: 200 });
  } catch (error) {
    console.error('Error sending LINE notification:', error);
    return new Response(`Failed to send notification: ${error?.message || error}`, { status: 500 });
  }
}