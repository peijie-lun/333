import { supabase } from '../../../supabaseClient.js';
import { Client } from '@line/bot-sdk';

// 使用 Bot2 的 token，若未設定則回落到 Bot1
const lineClient = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN_BOT2 || process.env.LINE_CHANNEL_ACCESS_TOKEN
});
const BOT_TAG = 'BOT2';
const webhookSecret = process.env.IOT_WEBHOOK_SECRET;
const SOURCE_TABLE = 'iot_events';

function safeString(value, fallback = '未提供') {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  return String(value);
}

function normalizeConfiguration(configuration) {
  if (!configuration) {
    return {};
  }
  if (typeof configuration === 'object') {
    return configuration;
  }
  if (typeof configuration === 'string') {
    try {
      return JSON.parse(configuration);
    } catch {
      return {};
    }
  }
  return {};
}

function isEmergencyEvent(record) {
  return record.event_type === 'emergency';
}

function buildEventMessage(record, unitInfo, recipientProfile) {
  const eventData = normalizeConfiguration(record.event_data);
  const createdAt = record.created_at
    ? new Date(record.created_at).toLocaleString('zh-TW', { hour12: false })
    : new Date().toLocaleString('zh-TW', { hour12: false });
  const roomName = unitInfo?.unit_number || unitInfo?.unit_code || '未提供';

  const lines = [
    '🚨 【IoT 緊急事件通知】',
    '',
    `事件類型：${safeString(record.event_type)}`,
    `設備 ID：${safeString(record.device_id)}`,
    `房號：${roomName}`,
    `發生時間：${createdAt}`
  ];

  if (recipientProfile?.name) {
    lines.push(`通知對象：${recipientProfile.name}`);
  }

  if (record.message) {
    lines.push('', `詳細訊息：${safeString(record.message)}`);
  }

  if (Object.keys(eventData).length > 0) {
    lines.push('', '事件資料：');
    Object.entries(eventData).forEach(([key, value]) => {
      const displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
      lines.push(`  ${key}: ${displayValue}`);
    });
  }

  lines.push('', '⚠️ 請立即確認並採取適當行動');

  return {
    type: 'text',
    text: lines.join('\n')
  };
}

async function resolveRecipient(record) {
  const eventData = normalizeConfiguration(record.event_data);
  
  // 優先從 event_data 尋找明確的 LINE user ID
  const explicitLineUserId = eventData.line_user_id || 
                             eventData.notify_line_user_id || 
                             eventData.recipient_line_user_id;
  if (explicitLineUserId) {
    return {
      lineUserId: explicitLineUserId,
      profile: null
    };
  }

  // 其次從 linked_record_id 關聯查詢
  if (record.linked_record_type === 'emergency' && record.linked_record_id) {
    const { data: emergencyRecord, error: emergencyError } = await supabase
      .from('emergency_contacts')
      .select('contact_line_user_id, resident_profile:resident_profile_id(name)')
      .eq('id', record.linked_record_id)
      .maybeSingle();

    if (!emergencyError && emergencyRecord?.contact_line_user_id) {
      return {
        lineUserId: emergencyRecord.contact_line_user_id,
        profile: emergencyRecord.resident_profile
      };
    }
  }

  return null;
}

export async function POST(req) {
  console.log(`🚨 [${BOT_TAG}] [IoT 事件] Webhook 收到觸發`);

  try {
    const inboundSecret = req.headers.get('x-webhook-secret');

    // DEBUG: 檢查 env 與 inbound secret 是否存在（不會完整印出 secret）
    console.log(`🔍 [${BOT_TAG}] IOT_WEBHOOK_SECRET present: ${!!webhookSecret}`);
    console.log(`🔍 [${BOT_TAG}] inbound header present: ${!!inboundSecret}`);
    if (webhookSecret) {
      try {
        const masked = String(webhookSecret).length > 10
          ? String(webhookSecret).slice(0,6) + '...' + String(webhookSecret).slice(-4)
          : '[masked]';
        console.log(`🔒 [${BOT_TAG}] IOT_WEBHOOK_SECRET masked: ${masked}`);
      } catch {}
    }

    if (!webhookSecret) {
      console.error(`❌ [${BOT_TAG}] [IoT 事件] 未設定 IOT_WEBHOOK_SECRET`);
      return Response.json({ success: false, message: 'Server secret not configured' }, { status: 500 });
    }

    if (!inboundSecret || inboundSecret !== webhookSecret) {
      console.warn(`⚠️ [${BOT_TAG}] [IoT 事件] secret 驗證失敗`);
      return Response.json({ success: false, message: 'Unauthorized webhook' }, { status: 401 });
    }

    const body = await req.json();
    console.log(`📥 [${BOT_TAG}] [IoT 事件] Webhook 內容:`, JSON.stringify(body, null, 2));

    const { type, table, record } = body;

    if (!record || typeof record !== 'object') {
      console.warn(`⚠️ [${BOT_TAG}] [IoT 事件] 缺少 record 內容`);
      return Response.json({ success: false, message: 'Missing webhook record' }, { status: 400 });
    }

    if (type !== 'INSERT' || table !== SOURCE_TABLE) {
      console.log(`ℹ️ [${BOT_TAG}] [IoT 事件] 操作類型或表名不匹配，略過`);
      return Response.json({ success: false, message: 'Invalid webhook data' }, { status: 400 });
    }

    if (!record.event_type || !record.device_id) {
      console.warn(`⚠️ [${BOT_TAG}] [IoT 事件] 缺少 event_type / device_id`);
      return Response.json({ success: false, message: 'Missing event information' }, { status: 400 });
    }

    if (!isEmergencyEvent(record)) {
      console.log(`ℹ️ [${BOT_TAG}] [IoT 事件] 非 emergency 事件，略過`);
      return Response.json({ success: false, message: 'Not an emergency event' }, { status: 400 });
    }

    const recipient = await resolveRecipient(record);

    if (!recipient || !recipient.lineUserId) {
      console.warn(`⚠️ [${BOT_TAG}] [IoT 事件] 找不到可推播的 LINE user ID`);
      return Response.json({ success: false, message: 'No LINE recipient found' }, { status: 400 });
    }

    let unitInfo = { unit_number: null, unit_code: null };
    
    // 如果有 linked_record_id，試著從相關表獲取房號資訊
    if (record.linked_record_id && record.linked_record_type) {
      try {
        if (record.linked_record_type === 'emergency') {
          const { data: emergencyData } = await supabase
            .from('emergency_contacts')
            .select('resident_profile:resident_profile_id(unit_id)')
            .eq('id', record.linked_record_id)
            .maybeSingle();

          if (emergencyData?.resident_profile?.unit_id) {
            const { data: unitData } = await supabase
              .from('units')
              .select('unit_number, unit_code')
              .eq('id', emergencyData.resident_profile.unit_id)
              .maybeSingle();

            if (unitData) {
              unitInfo = unitData;
            }
          }
        }
      } catch (unitErr) {
        console.warn(`⚠️ [${BOT_TAG}] [IoT 事件] 查詢房號失敗:`, unitErr.message);
      }
    }

    const message = buildEventMessage(record, unitInfo, recipient.profile);

    console.log(`📤 [${BOT_TAG}] [IoT 事件] 發送消息給 LINE user:`, recipient.lineUserId);
    await lineClient.pushMessage(recipient.lineUserId, message);

    // 標記該事件已處理
    try {
      await supabase
        .from('iot_events')
        .update({
          processed: true,
          processed_at: new Date().toISOString()
        })
        .eq('id', record.id);
    } catch (updateErr) {
      console.warn(`⚠️ [${BOT_TAG}] [IoT 事件] 更新 processed 狀態失敗:`, updateErr.message);
    }

    return Response.json({
      success: true,
      message: 'IoT emergency event notification sent successfully',
      eventId: record.id,
      deviceId: record.device_id,
      eventType: record.event_type,
      recipientLineUserId: recipient.lineUserId
    }, { status: 200 });
  } catch (err) {
    console.error(`❌ [${BOT_TAG}] [IoT 事件] Webhook 處理失敗:`, err);
    return Response.json({
      success: false,
      message: 'Internal server error',
      error: err.message
    }, { status: 500 });
  }
}
