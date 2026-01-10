export async function POST(req) {
  try {
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

    // 使用 Supabase REST API 查詢
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    let queryUrl = '';
    if (visitorId) {
      // 如果有 visitorId，直接查詢
      queryUrl = `${supabaseUrl}/rest/v1/visitors?id=eq.${visitorId}&select=reserved_by_id,profiles:reserved_by_id(line_user_id)`;
    } else {
      // 如果沒有 visitorId，根據 visitorName 查詢最新的記錄
      queryUrl = `${supabaseUrl}/rest/v1/visitors?name=eq.${encodeURIComponent(visitorName)}&select=reserved_by_id,profiles:reserved_by_id(line_user_id)&order=created_at.desc&limit=1`;
    }

    console.log('Querying Supabase:', queryUrl);
    
    const supabaseResponse = await fetch(queryUrl, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
      },
    });

    if (!supabaseResponse.ok) {
      const errorText = await supabaseResponse.text();
      console.error('Supabase API error:', errorText);
      return new Response(`Supabase API error: ${errorText}`, { status: 500 });
    }

    const visitors = await supabaseResponse.json();
    console.log('Supabase response:', JSON.stringify(visitors));
    
    if (!visitors || visitors.length === 0 || !visitors[0]?.profiles?.line_user_id) {
      console.error('No line_user_id found for visitor:', visitorId || visitorName);
      return new Response('找不到使用者 line_user_id', { status: 404 });
    }

    const lineUserId = visitors[0].profiles.line_user_id;
    console.log('Sending LINE message to:', lineUserId);

    // 使用 fetch 呼叫 LINE Messaging API
    const lineResponse = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        to: lineUserId,
        messages: [{ type: 'text', text: message }],
      }),
    });

    if (!lineResponse.ok) {
      const errorText = await lineResponse.text();
      console.error('LINE API error:', errorText);
      return new Response(`LINE API error: ${errorText}`, { status: 500 });
    }

    console.log('Notification sent successfully');
    return new Response('Notification sent', { status: 200 });
  } catch (error) {
    console.error('Unexpected error in line-notify:', error);
    return new Response(`Server error: ${error.message}`, { status: 500 });
  }
}
