import { supabase } from '@/utils/supabaseClient';
import { Client } from '@line/bot-sdk';

const lineClient = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN
});
const webhookSecret = process.env.IOT_WEBHOOK_SECRET;

/**
 * IoT 緊急事件 Webhook
 * 當 iot_action_logs 表中有 event_type='emergency' 的新記錄時，
 * Supabase Database Webhook 會觸發此端點
 */
export async function POST(req) {
  console.log('🚨 [IoT 緊急事件] Webhook 收到觸發');

  try {
    const inboundSecret = req.headers.get('x-webhook-secret');
    if (!webhookSecret) {
      console.error('[IoT 緊急事件] ❌ 未設定 IOT_WEBHOOK_SECRET');
      return Response.json({ success: false, message: 'Server secret not configured' }, { status: 500 });
    }

    if (!inboundSecret || inboundSecret !== webhookSecret) {
      console.warn('[IoT 緊急事件] ⚠️ secret 驗證失敗');
      return Response.json({ success: false, message: 'Unauthorized webhook' }, { status: 401 });
    }

    const body = await req.json();
    console.log('[IoT 緊急事件] Webhook 內容:', JSON.stringify(body, null, 2));

    // Supabase 的 webhook 結構通常包含以下信息：
    // {
    //   type: 'INSERT',
    //   table: 'iot_action_logs',
    //   record: { 完整的新插入記錄 },
    //   schema: 'public',
    //   old_record: null
    // }

    const { type, table, record } = body;

    if (!record || typeof record !== 'object') {
      console.warn('[IoT 緊急事件] ⚠️ 缺少 record 內容');
      return Response.json({ success: false, message: 'Missing webhook record' }, { status: 400 });
    }

    // 只處理新插入的記錄
    if (type !== 'INSERT' || table !== 'iot_action_logs') {
      console.log('[IoT 緊急事件] 操作類型或表名不匹配，略過');
      return Response.json({ success: false, message: 'Invalid webhook data' }, { status: 400 });
    }

    // 檢查是否是緊急事件
    if (record.event_type !== 'emergency' || record.cmd !== 'E') {
      console.log('[IoT 緊急事件] 非緊急事件，略過');
      return Response.json({ success: false, message: 'Not an emergency event' }, { status: 400 });
    }

    const operatorProfileId = record.operator_profile_id;
    console.log('[IoT 緊急事件] 操作人員 ID:', operatorProfileId);

    if (!operatorProfileId) {
      console.warn('[IoT 緊急事件] ⚠️ 缺少 operator_profile_id');
      return Response.json({ success: false, message: 'Missing operator profile ID' }, { status: 400 });
    }

    // 查詢操作人員（住户）的信息
    const { data: operatorProfile, error: profileError } = await supabase
      .from('profiles')
      .select('id, name, unit_id, emergency_contact_name, emergency_contact_phone, emergency_contact_line_user_id')
      .eq('id', operatorProfileId)
      .maybeSingle();

    if (profileError || !operatorProfile) {
      console.error('[IoT 緊急事件] ❌ 無法查詢操作人員信息:', profileError);
      return Response.json({ success: false, message: 'Failed to fetch operator profile' }, { status: 500 });
    }

    console.log('[IoT 緊急事件] 操作人員信息:', {
      name: operatorProfile.name,
      emergencyContactName: operatorProfile.emergency_contact_name,
      emergencyContactPhone: operatorProfile.emergency_contact_phone,
      emergencyContactLineUserId: operatorProfile.emergency_contact_line_user_id
    });

    // 檢查是否有緊急聯繫人的 LINE user ID
    if (!operatorProfile.emergency_contact_line_user_id) {
      console.warn('[IoT 緊急事件] ⚠️ 未找到緊急聯繫人的 LINE user ID');
      return Response.json({ 
        success: false, 
        message: 'No emergency contact line user ID found'
      }, { status: 400 });
    }

    // 查詢住户的房號信息
    let roomInfo = '未提供';
    if (operatorProfile.unit_id) {
      const { data: unitData } = await supabase
        .from('units')
        .select('unit_number, unit_code')
        .eq('id', operatorProfile.unit_id)
        .maybeSingle();
      
      if (unitData) {
        roomInfo = unitData.unit_number || unitData.unit_code || '未提供';
      }
    }

    // 構建緊急事件通知消息
    const emergencyMessage = {
      type: 'text',
      text: `🚨 【緊急事件通知】\n\n` +
            `住户姓名：${operatorProfile.name || '未提供'}\n` +
            `房號：${roomInfo}\n` +
            `事件類型：緊急求助\n` +
            `事件時間：${new Date().toLocaleString('zh-TW', { hour12: false })}\n\n` +
            `⚠️ 請立即採取行動！`
    };

    // 發送消息給緊急聯繫人
    try {
      console.log('[IoT 緊急事件] 發送消息給緊急聯繫人:', operatorProfile.emergency_contact_line_user_id);
      
      await lineClient.pushMessage(operatorProfile.emergency_contact_line_user_id, emergencyMessage);

      console.log('[IoT 緊急事件] ✅ 消息已發送給緊急聯繫人');

      // 記錄通知歷史（可選）
      await supabase
        .from('iot_action_logs')
        .update({
          message: `Emergency notification sent to ${operatorProfile.emergency_contact_name} (${operatorProfile.emergency_contact_phone})`
        })
        .eq('id', record.id);

      return Response.json({ 
        success: true, 
        message: 'Emergency notification sent successfully',
        iotLogId: record.id,
        emergencyContactName: operatorProfile.emergency_contact_name
      }, { status: 200 });

    } catch (lineErr) {
      console.error('[IoT 緊急事件] ❌ 無法發送 LINE 消息:', lineErr);
      
      // 記錄失敗原因
      await supabase
        .from('iot_action_logs')
        .update({
          message: `Failed to send emergency notification: ${lineErr.message}`
        })
        .eq('id', record.id);

      return Response.json({ 
        success: false, 
        message: 'Failed to send LINE message',
        error: lineErr.message
      }, { status: 500 });
    }

  } catch (err) {
    console.error('[IoT 緊急事件] ❌ Webhook 處理失敗:', err);
    return Response.json({ 
      success: false, 
      message: 'Internal server error',
      error: err.message
    }, { status: 500 });
  }
}
