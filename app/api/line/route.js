import { Client, validateSignature } from '@line/bot-sdk';
import { createClient } from '@supabase/supabase-js';
import { fileTypeFromBuffer } from 'file-type';
import heicConvert from 'heic-convert';

const supabaseServerKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(
  process.env.SUPABASE_URL,
  supabaseServerKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  }
);
import { chat } from '../../../grokmain.js';
import 'dotenv/config';

export const runtime = 'nodejs';

const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new Client(lineConfig);// LINE Bot SDK 客戶端
const emergencyImageBucket = process.env.SUPABASE_EMERGENCY_IMAGE_BUCKET || 'emergency_images';
const maintenanceImageBucket = process.env.SUPABASE_MAINTENANCE_IMAGE_BUCKET || 'maintenance_images';

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('⚠️ 未設定 SUPABASE_SERVICE_ROLE_KEY，Storage 上傳可能因權限被拒。');
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function makeImageProcessingError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function isHeifType(detected) {
  if (!detected) return false;
  const ext = (detected.ext || '').toLowerCase();
  const mime = (detected.mime || '').toLowerCase();
  return ext === 'heic' || ext === 'heif' || mime.includes('heic') || mime.includes('heif');
}

async function normalizeEmergencyImageBuffer(inputBuffer) {
  const detected = await fileTypeFromBuffer(inputBuffer);

  if (!detected) {
    throw makeImageProcessingError('UNSUPPORTED_IMAGE_FORMAT', '無法辨識圖片格式');
  }

  if (isHeifType(detected)) {
    try {
      const converted = await heicConvert({
        buffer: inputBuffer,
        format: 'JPEG',
        quality: 0.9
      });

      return {
        buffer: Buffer.from(converted),
        ext: 'jpg',
        contentType: 'image/jpeg'
      };
    } catch (convertErr) {
      console.error('❌ HEIF 轉檔失敗:', convertErr);
      throw makeImageProcessingError('HEIF_CONVERT_FAILED', 'HEIF 轉 JPEG 失敗');
    }
  }

  const ext = (detected.ext || '').toLowerCase();
  const mime = (detected.mime || '').toLowerCase();

  if (mime === 'image/jpeg' || mime === 'image/jpg') {
    return { buffer: inputBuffer, ext: 'jpg', contentType: 'image/jpeg' };
  }

  if (mime === 'image/png') {
    return { buffer: inputBuffer, ext: 'png', contentType: 'image/png' };
  }

  throw makeImageProcessingError('UNSUPPORTED_IMAGE_FORMAT', `不支援的圖片格式: ${ext || mime}`);
}

async function uploadEmergencyImageFromLineMessage(messageId, userId) {
  const messageStream = await client.getMessageContent(messageId);
  const rawImageBuffer = await streamToBuffer(messageStream);
  const normalizedImage = await normalizeEmergencyImageBuffer(rawImageBuffer);
  const filePath = `line-emergency/${new Date().toISOString().slice(0, 10)}/${userId}_${messageId}.${normalizedImage.ext}`;

  const { error: uploadError } = await supabase.storage
    .from(emergencyImageBucket)
    .upload(filePath, normalizedImage.buffer, {
      contentType: normalizedImage.contentType,
      upsert: false
    });

  if (uploadError) {
    console.error('❌ Storage 上傳失敗:', {
      bucket: emergencyImageBucket,
      filePath,
      message: uploadError.message,
      statusCode: uploadError.statusCode
    });
    throw makeImageProcessingError('STORAGE_UPLOAD_FAILED', 'Storage 圖片上傳失敗');
  }

  const { data: publicUrlData } = supabase.storage.from(emergencyImageBucket).getPublicUrl(filePath);
  let imageUrl = publicUrlData?.publicUrl || null;

  if (!imageUrl) {
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from(emergencyImageBucket)
      .createSignedUrl(filePath, 60 * 60 * 24 * 7);

    if (signedUrlError || !signedUrlData?.signedUrl) {
      throw signedUrlError || new Error('建立圖片連結失敗');
    }
    imageUrl = signedUrlData.signedUrl;
  }

  return imageUrl;
}

async function uploadMaintenanceImageFromLineMessage(messageId, userId) {
  const messageStream = await client.getMessageContent(messageId);
  const rawImageBuffer = await streamToBuffer(messageStream);
  const normalizedImage = await normalizeEmergencyImageBuffer(rawImageBuffer);
  const filePath = `line-maintenance/${new Date().toISOString().slice(0, 10)}/${userId}_${messageId}.${normalizedImage.ext}`;

  const { error: uploadError } = await supabase.storage
    .from(maintenanceImageBucket)
    .upload(filePath, normalizedImage.buffer, {
      contentType: normalizedImage.contentType,
      upsert: false
    });

  if (uploadError) {
    console.error('❌ Maintenance Storage 上傳失敗:', {
      bucket: maintenanceImageBucket,
      filePath,
      message: uploadError.message,
      statusCode: uploadError.statusCode
    });
    throw makeImageProcessingError('MAINTENANCE_STORAGE_UPLOAD_FAILED', '報修圖片上傳失敗');
  }

  const { data: publicUrlData } = supabase.storage.from(maintenanceImageBucket).getPublicUrl(filePath);
  let imageUrl = publicUrlData?.publicUrl || null;

  if (!imageUrl) {
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from(maintenanceImageBucket)
      .createSignedUrl(filePath, 60 * 60 * 24 * 7);

    if (signedUrlError || !signedUrlData?.signedUrl) {
      throw signedUrlError || new Error('建立報修圖片連結失敗');
    }
    imageUrl = signedUrlData.signedUrl;
  }

  return imageUrl;
}

async function safeReplyMessage(replyToken, userId, message) {
  try {
    await client.replyMessage(replyToken, message);
  } catch (err) {
    const statusCode = err?.statusCode || err?.originalError?.status;
    if (statusCode === 400) {
      console.log('[INFO] replyToken 已失效或已使用，改用 push 回覆');
      try {
        await client.pushMessage(userId, message);
      } catch (pushErr) {
        console.error('❌ pushMessage 回覆也失敗:', pushErr);
      }
      return;
    }
    throw err;
  }
}

/**
 * 🚨 推播緊急通知給住户的聯繫人
 * 當 IoT 設備或其他系統觸發緊急事件時使用此函數
 * 
 * @param {string} operatorProfileId - 觸發緊急事件的住户 UUID
 * @param {string} eventContext - 事件背景說明（例如 "IoT 緊急按鈕" ）
 * @returns {Promise<{success: boolean, message: string, contactName?: string}>}
 */
async function notifyEmergencyContact(operatorProfileId, eventContext = 'IoT 緊急事件') {
  try {
    console.log(`🚨 [緊急通知] 準備推播給聯繫人，操作人員 ID: ${operatorProfileId}`);

    // 查詢住户信息和緊急聯繫人
    const { data: operatorProfile, error: profileError } = await supabase
      .from('profiles')
      .select('id, name, unit_id, emergency_contact_name, emergency_contact_phone, emergency_contact_line_user_id')
      .eq('id', operatorProfileId)
      .maybeSingle();

    if (profileError || !operatorProfile) {
      console.error('[緊急通知] ❌ 無法查詢住户信息:', profileError);
      return { success: false, message: '無法查詢住户信息' };
    }

    // 檢查是否有緊急聯繫人的 LINE user ID
    if (!operatorProfile.emergency_contact_line_user_id) {
      console.warn('[緊急通知] ⚠️ 住户未設定緊急聯繫人的 LINE user ID');
      return { 
        success: false, 
        message: '住户未設定緊急聯繫人的 LINE user ID'
      };
    }

    // 查詢房號信息
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

    // 構建緊急通知消息
    const emergencyMessage = {
      type: 'text',
      text: `🚨 【緊急事件通知】\n\n` +
            `事件類型：${eventContext}\n` +
            `住户姓名：${operatorProfile.name || '未提供'}\n` +
            `房號：${roomInfo}\n` +
            `聯繫電話：${operatorProfile.emergency_contact_phone || '未提供'}\n` +
            `事件時間：${new Date().toLocaleString('zh-TW', { hour12: false })}\n\n` +
            `⚠️ 請立即採取行動！`
    };

    // 發送消息給緊急聯繫人
    await client.pushMessage(operatorProfile.emergency_contact_line_user_id, emergencyMessage);

    console.log(`🚨 [緊急通知] ✅ 已發送給 ${operatorProfile.emergency_contact_name}`);
    
    return { 
      success: true, 
      message: '緊急通知已發送',
      contactName: operatorProfile.emergency_contact_name
    };

  } catch (err) {
    console.error('[緊急通知] ❌ 發送失敗:', err.message);
    return { 
      success: false, 
      message: `發送失敗: ${err.message}` 
    };
  }
}

function buildEmergencyConfirmFlex(sessionId, eventType, location, description, imageUrl) {
  const bubble = {
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      contents: [
        {
          type: 'text',
          text: '📋 確認事件資訊',
          weight: 'bold',
          size: 'lg',
          wrap: true
        },
        { type: 'separator', margin: 'md' },
        {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          contents: [
            {
              type: 'text',
              text: `🔹 類型：${eventType || '未指定'}`,
              wrap: true,
              size: 'sm',
              color: '#666666'
            },
            {
              type: 'text',
              text: `🔹 地點：${location || '未指定'}`,
              wrap: true,
              size: 'sm',
              color: '#666666'
            },
            {
              type: 'text',
              text: `🔹 描述：${description || '未提供'}`,
              wrap: true,
              size: 'sm',
              color: '#666666'
            },
            {
              type: 'text',
              text: `🔹 附圖：${imageUrl ? '已附加' : '略過'}`,
              wrap: true,
              size: 'sm',
              color: '#666666'
            }
          ]
        }
      ]
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        {
          type: 'button',
          style: 'primary',
          color: '#22C55E',
          action: {
            type: 'postback',
            label: '✅ 確認提交',
            data: `action=submit_emergency&session_id=${sessionId}`,
            displayText: '確認提交緊急事件'
          }
        },
        {
          type: 'button',
          style: 'secondary',
          action: {
            type: 'postback',
            label: '❌ 取消',
            data: `action=cancel_emergency&session_id=${sessionId}`,
            displayText: '取消緊急事件回報'
          }
        }
      ]
    }
  };

  if (imageUrl) {
    bubble.hero = {
      type: 'image',
      url: imageUrl,
      size: 'full',
      aspectRatio: '20:13',
      aspectMode: 'cover'
    };
  }

  return {
    type: 'flex',
    altText: '📋 確認事件資訊',
    contents: bubble
  };
}

function buildFacilityMainMenuFlex() {
  return {
    type: 'flex',
    altText: '預約公共設施',
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          { type: 'text', text: '🏢 公共設施預約', weight: 'bold', size: 'lg' },
          { type: 'text', text: '請選擇操作項目', size: 'sm', color: '#666666' }
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            style: 'primary',
            action: {
              type: 'postback',
              label: '我要預約',
              data: 'action=facility_start_booking',
              displayText: '我要預約'
            }
          },
          {
            type: 'button',
            style: 'secondary',
            action: {
              type: 'postback',
              label: '我的預約',
              data: 'action=facility_my_bookings',
              displayText: '我的預約'
            }
          },
          {
            type: 'button',
            style: 'secondary',
            action: {
              type: 'postback',
              label: '取消預約',
              data: 'action=facility_cancel_menu',
              displayText: '取消預約'
            }
          }
        ]
      }
    }
  };
}

function parseDateInput(dateText) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return null;
  const dt = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function parseTimeRangeInput(text) {
  const match = text.match(/^([01]\d|2[0-3]):([0-5]\d)\s*-\s*([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return null;
  const start = `${match[1]}:${match[2]}`;
  const end = `${match[3]}:${match[4]}`;
  if (start >= end) return null;
  return { start, end };
}

// 記憶體暫存報修會話資料（取代資料庫草稿）
const repairSessions = new Map();
// 結構：{ userId: { location: string, description: string, startTime: timestamp } }

// 記憶體暫存設施預約流程狀態
const facilityBookingSessions = new Map();

// 追蹤已使用的 replyToken（防止重複處理）
const usedReplyTokens = new Set();

// 追蹤已處理的 webhook event（防止 LINE redelivery 造成重複訊息）
const processedWebhookEvents = new Map();
const WEBHOOK_EVENT_TTL_MS = 10 * 60 * 1000; // 10 分鐘

function cleanupProcessedWebhookEvents(now = Date.now()) {
  for (const [eventId, ts] of processedWebhookEvents.entries()) {
    if (now - ts > WEBHOOK_EVENT_TTL_MS) {
      processedWebhookEvents.delete(eventId);
    }
  }
}

// 移除圖片關鍵字攔截，讓所有查詢都進入 AI 處理
// const IMAGE_KEYWORDS = ['圖片', '設施', '游泳池', '健身房', '大廳'];
// 處理 LINE Webhook 請求
export async function POST(req) {
  const requestId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  console.log(`\n========== [${requestId}] 新的 Webhook 請求 ==========`);
  
  try {
    const rawBody = await req.text();// 取得原始請求體
    if (!rawBody) return new Response('Bad Request: Empty body', { status: 400 });

    // 驗證 LINE signature（使用官方 SDK）
    const signature = req.headers.get('x-line-signature');
    console.log('[Debug] Channel Secret exists:', !!lineConfig.channelSecret);
    console.log('[Debug] Signature exists:', !!signature);
    console.log('[Debug] Body length:', rawBody.length);
    
    if (!signature) {
      console.error('[Signature Error] No signature header');
      return new Response('Unauthorized', { status: 401 });
    }
    
    const isValid = validateSignature(rawBody, lineConfig.channelSecret, signature);
    console.log('[Debug] Signature valid:', isValid);
    
    if (!isValid) {
      console.error('[Signature Error] Invalid signature');
      return new Response('Unauthorized', { status: 401 });
    }

    let events;// 儲存事件陣列
    try {
      events = JSON.parse(rawBody).events;// 解析事件陣列
    } catch {
      return new Response('Bad Request: Invalid JSON', { status: 400 });
    }

    for (const event of events) {// 逐一處理每個事件
      const userId = event.source?.userId;
      if (!userId) continue;

      // 去重：同一 webhookEventId 不重複處理（含 redelivery）
      const webhookEventId = event.webhookEventId;
      const isRedelivery = !!event.deliveryContext?.isRedelivery;
      const now = Date.now();
      cleanupProcessedWebhookEvents(now);

      if (webhookEventId && processedWebhookEvents.has(webhookEventId)) {
        console.log('⚠️ [重複 Event] webhookEventId 已處理，跳過:', webhookEventId);
        continue;
      }

      if (isRedelivery && webhookEventId) {
        // 若是 redelivery 且前次已完成，這次直接跳過避免重複回覆
        console.log('ℹ️ [Redelivery] 偵測到重送事件，跳過:', webhookEventId);
        continue;
      }

      if (webhookEventId) {
        processedWebhookEvents.set(webhookEventId, now);
      }

      // 檢查 replyToken 是否已被使用（防止重複處理）
      const replyToken = event.replyToken;
      if (replyToken && usedReplyTokens.has(replyToken)) {
        console.log('⚠️ [重複 Token] 此 replyToken 已被處理，跳過:', replyToken);
        continue;
      }

      // 嘗試抓 LINE Profile
      let profile = { displayName: '', pictureUrl: '', statusMessage: '' };
      try {
        profile = await client.getProfile(userId);// 抓取使用者個人資料
      } catch (err) {
        console.warn('⚠️ 無法抓到 profile，只存 userId。', err);
      }

      // --- 1. 檢查使用者是否已存在 profiles ---
      const { data: existingProfile, error: checkError } = await supabase
        .from('profiles')
        .select('id, name, unit_id, line_user_id, line_display_name, line_avatar_url, line_status_message, points_balance')
        .eq('line_user_id', userId)
        .maybeSingle();

      if (checkError) {
        console.error('❌ Supabase 檢查錯誤:', checkError);
      }

      const profileChanged =
        !existingProfile ||
        existingProfile.line_display_name !== (profile.displayName || '') ||
        existingProfile.line_avatar_url !== (profile.pictureUrl || '') ||
        existingProfile.line_status_message !== (profile.statusMessage || '');

      // follow 事件或 profile 變動才 upsert
      if (event.type === 'follow' || profileChanged) {
        const upsertProfile = {
          line_user_id: userId,
          line_display_name: profile.displayName || '',
          line_avatar_url: profile.pictureUrl || '',
          line_status_message: profile.statusMessage || '',
          email: userId + '@line.local', // 預設 email
          password: userId, // 預設密碼（可自行加密或亂數）
          updated_at: new Date().toISOString(),
        };
        if (existingProfile?.id) upsertProfile.id = existingProfile.id;
        const { error: upsertError } = await supabase.from('profiles').upsert([
          upsertProfile
        ], { onConflict: 'line_user_id' });

        if (upsertError) console.error('❌ Supabase upsert 錯誤:', upsertError);
      }

      // --- 2. 處理文字訊息 ---
      if (event.type === 'message' && event.message.type === 'text') {
        const userText = event.message.text.trim();
        const replyToken = event.replyToken;
        console.log('📩 使用者輸入:', userText);
        console.log('📩 replyToken:', replyToken);
        console.log('📩 使用者輸入長度:', userText.length);
        console.log('📩 包含 📍?:', userText.includes('📍'));
        console.log('📩 包含 🛠?:', userText.includes('🛠'));
        console.log('📩 包含 📷?:', userText.includes('📷'));

        // 🚫 優先檢查：如果包含報修相關 emoji，直接跳過
        if (userText.includes('📍') || userText.includes('🛠') || userText.includes('📷')) {
          console.log('⏭️ [EMOJI 檢測] 偵測到報修提示 emoji，不回覆');
          continue;
        }

        // 🚫 優先忽略特定的系統提示訊息，不做任何回覆
        // 完全移除空白、換行、標點符號後比對
        const cleanText = userText.replace(/[\s\n\r,，.。:：;；!！?？]/g, '').toLowerCase();
        
        console.log('[DEBUG] 清理後的文字:', cleanText);
        
        // 檢查是否包含忽略關鍵字（更嚴格的匹配）
        const ignoreKeywords = [
          '本系統可以',
          '查詢社區相關問題',
          '輸入問題立即獲得解答',
          '查看熱門常見問題',
          '接收推播',
          '歡迎直接輸入查詢',
          '請上傳照片',
          '上傳照片並輸入',
          '照片並輸入地點',
          '地點與問題說明',
          '地點：',
          '上傳照片'
        ];
        
        const shouldIgnore = ignoreKeywords.some(keyword => {
          const cleanKeyword = keyword.replace(/[\s\n\r,，.。:：;；!！?？]/g, '').toLowerCase();
          const matched = cleanText.includes(cleanKeyword);
          if (matched) {
            console.log('[DEBUG] 匹配到忽略關鍵字:', keyword);
          }
          return matched;
        });
        
        if (shouldIgnore) {
          console.log('⏭️ 忽略系統提示訊息，不回覆');
          continue;
        }

        // ===== 設施預約流程（MVP） =====
        const facilitySession = facilityBookingSessions.get(userId);

        if (facilitySession?.step === 'await_date') {
          if (userText === '取消' || userText === '取消預約流程') {
            facilityBookingSessions.delete(userId);
            await safeReplyMessage(replyToken, userId, {
              type: 'text',
              text: '已取消本次設施預約流程。'
            });
            usedReplyTokens.add(replyToken);
            continue;
          }

          const bookingDate = userText.trim();
          const parsedDate = parseDateInput(bookingDate);
          if (!parsedDate) {
            await safeReplyMessage(replyToken, userId, {
              type: 'text',
              text: '日期格式錯誤，請使用 YYYY-MM-DD，例如 2026-04-05。'
            });
            usedReplyTokens.add(replyToken);
            continue;
          }

          const today = new Date();
          today.setHours(0, 0, 0, 0);
          if (parsedDate < today) {
            await safeReplyMessage(replyToken, userId, {
              type: 'text',
              text: '不可預約過去日期，請重新輸入。'
            });
            usedReplyTokens.add(replyToken);
            continue;
          }

          facilityBookingSessions.set(userId, {
            ...facilitySession,
            bookingDate,
            step: 'await_time'
          });

          await safeReplyMessage(replyToken, userId, {
            type: 'text',
            text: `已選擇日期：${bookingDate}\n請輸入時段（HH:mm-HH:mm），例如 18:00-19:00。\n輸入「取消」可中止流程。`
          });
          usedReplyTokens.add(replyToken);
          continue;
        }

        if (facilitySession?.step === 'await_time') {
          if (userText === '取消' || userText === '取消預約流程') {
            facilityBookingSessions.delete(userId);
            await safeReplyMessage(replyToken, userId, {
              type: 'text',
              text: '已取消本次設施預約流程。'
            });
            usedReplyTokens.add(replyToken);
            continue;
          }

          const timeRange = parseTimeRangeInput(userText.trim());
          if (!timeRange) {
            await safeReplyMessage(replyToken, userId, {
              type: 'text',
              text: '時段格式錯誤，請使用 HH:mm-HH:mm，例如 18:00-19:00。'
            });
            usedReplyTokens.add(replyToken);
            continue;
          }

          if (!existingProfile?.id) {
            facilityBookingSessions.delete(userId);
            await safeReplyMessage(replyToken, userId, {
              type: 'text',
              text: '尚未完成住戶綁定，暫時無法預約設施。'
            });
            usedReplyTokens.add(replyToken);
            continue;
          }

          const { data: facilityInfo, error: facilityErr } = await supabase
            .from('facilities')
            .select('id, name, max_concurrent_bookings, base_price')
            .eq('id', facilitySession.facilityId)
            .maybeSingle();

          if (facilityErr || !facilityInfo) {
            facilityBookingSessions.delete(userId);
            await safeReplyMessage(replyToken, userId, {
              type: 'text',
              text: '找不到設施資料，請重新開始預約。'
            });
            usedReplyTokens.add(replyToken);
            continue;
          }

          const bookingPoints = Number(facilityInfo.base_price || 0);
          const currentPoints = Number(existingProfile?.points_balance || 0);

          if (currentPoints < bookingPoints) {
            facilityBookingSessions.delete(userId);
            await safeReplyMessage(replyToken, userId, {
              type: 'text',
              text: `點數不足，${facilityInfo.name} 需要 ${bookingPoints} 點，您目前剩餘 ${currentPoints} 點。`
            });
            usedReplyTokens.add(replyToken);
            continue;
          }

          const { data: deductedProfile, error: deductErr } = await supabase
            .from('profiles')
            .update({
              points_balance: currentPoints - bookingPoints,
              updated_at: new Date().toISOString()
            })
            .eq('id', existingProfile.id)
            .gte('points_balance', bookingPoints)
            .select('points_balance')
            .maybeSingle();

          if (deductErr || !deductedProfile) {
            facilityBookingSessions.delete(userId);
            await safeReplyMessage(replyToken, userId, {
              type: 'text',
              text: '扣點失敗，請稍後再試。'
            });
            usedReplyTokens.add(replyToken);
            continue;
          }

          const { count: conflictCount, error: conflictErr } = await supabase
            .from('facility_bookings')
            .select('id', { count: 'exact', head: true })
            .eq('facility_id', facilitySession.facilityId)
            .eq('booking_date', facilitySession.bookingDate)
            .in('status', ['confirmed'])
            .lt('start_time', `${timeRange.end}:00`)
            .gt('end_time', `${timeRange.start}:00`);

          if (conflictErr) {
            facilityBookingSessions.delete(userId);
            await safeReplyMessage(replyToken, userId, {
              type: 'text',
              text: '檢查時段可用性失敗，請稍後再試。'
            });
            usedReplyTokens.add(replyToken);
            continue;
          }

          const maxConcurrent = facilityInfo.max_concurrent_bookings || 1;
          if ((conflictCount || 0) >= maxConcurrent) {
            await safeReplyMessage(replyToken, userId, {
              type: 'text',
              text: `此時段已額滿（最多 ${maxConcurrent} 組），請改選其他時段。`
            });
            usedReplyTokens.add(replyToken);
            continue;
          }

          let userRoom = null;
          if (existingProfile?.unit_id) {
            const { data: unitData } = await supabase
              .from('units')
              .select('unit_number, unit_code')
              .eq('id', existingProfile.unit_id)
              .maybeSingle();
            userRoom = unitData?.unit_number || unitData?.unit_code || null;
          }

          const { data: createdBooking, error: bookingErr } = await supabase
            .from('facility_bookings')
            .insert([{
              facility_id: facilitySession.facilityId,
              user_id: existingProfile.id,
              booking_date: facilitySession.bookingDate,
              start_time: `${timeRange.start}:00`,
              end_time: `${timeRange.end}:00`,
              status: 'confirmed',
              unit_id: existingProfile.unit_id || null,
              user_name: existingProfile.name || existingProfile.line_display_name || null,
              user_room: userRoom,
              notes: 'LINE Bot 預約',
              points_spent: bookingPoints
            }])
            .select('id')
            .maybeSingle();

          if (bookingErr || !createdBooking) {
            await supabase
              .from('profiles')
              .update({
                points_balance: currentPoints,
                updated_at: new Date().toISOString()
              })
              .eq('id', existingProfile.id);

            facilityBookingSessions.delete(userId);
            await safeReplyMessage(replyToken, userId, {
              type: 'text',
              text: '預約失敗，請稍後再試。'
            });
            usedReplyTokens.add(replyToken);
            continue;
          }

          facilityBookingSessions.delete(userId);
          await safeReplyMessage(replyToken, userId, {
            type: 'text',
            text:
              `預約成功\n` +
              `設施：${facilityInfo.name}\n` +
              `日期：${facilitySession.bookingDate}\n` +
              `時段：${timeRange.start}-${timeRange.end}\n` +
              `扣點：${bookingPoints} 點\n` +
              `剩餘點數：${deductedProfile.points_balance} 點\n` +
              `預約編號：${createdBooking.id.slice(0, 8)}`
          });
          usedReplyTokens.add(replyToken);
          continue;
        }

        const isFacilityMenuText = cleanText === '預約公共設施' || cleanText === '設施預約' || cleanText === '公共設施預約';
        const isStartBookingText = userText === '我要預約';
        const isMyBookingsText = userText === '我的預約';
        const isCancelBookingText = userText === '取消預約';

        if (isFacilityMenuText) {
          await safeReplyMessage(replyToken, userId, buildFacilityMainMenuFlex());
          usedReplyTokens.add(replyToken);
          continue;
        }

        if (isStartBookingText) {
          const { data: facilities, error: facilityQueryErr } = await supabase
            .from('facilities')
            .select('id, name, location, capacity, base_price, available')
            .eq('available', true)
            .order('name', { ascending: true })
            .limit(10);

          if (facilityQueryErr || !facilities || facilities.length === 0) {
            await safeReplyMessage(replyToken, userId, {
              type: 'text',
              text: '目前沒有可預約的設施，請稍後再試。'
            });
            usedReplyTokens.add(replyToken);
            continue;
          }

          const bubbles = facilities.map((f) => ({
            type: 'bubble',
            body: {
              type: 'box',
              layout: 'vertical',
              spacing: 'sm',
              contents: [
                { type: 'text', text: f.name, weight: 'bold', size: 'lg', wrap: true },
                { type: 'text', text: `地點：${f.location || '未提供'}`, size: 'sm', color: '#666666', wrap: true },
                { type: 'text', text: `容量：${f.capacity || 1} 人`, size: 'sm', color: '#666666', wrap: true },
                { type: 'text', text: `費用：${f.base_price || 0} 點`, size: 'sm', color: '#666666', wrap: true }
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
                    type: 'postback',
                    label: '選擇此設施',
                    data: `action=facility_select&facility_id=${f.id}`,
                    displayText: `選擇設施：${f.name}`
                  }
                }
              ]
            }
          }));

          await safeReplyMessage(replyToken, userId, {
            type: 'flex',
            altText: '請選擇要預約的設施',
            contents: { type: 'carousel', contents: bubbles }
          });
          usedReplyTokens.add(replyToken);
          continue;
        }

        if (isMyBookingsText) {
          if (!existingProfile?.id) {
            await safeReplyMessage(replyToken, userId, {
              type: 'text',
              text: '尚未完成住戶綁定，暫時無法查詢預約。'
            });
            usedReplyTokens.add(replyToken);
            continue;
          }

          const { data: myBookings, error: myBookingErr } = await supabase
            .from('facility_bookings')
            .select('id, booking_date, start_time, end_time, status, facilities(name)')
            .eq('user_id', existingProfile.id)
            .in('status', ['confirmed', 'waitlisted'])
            .gte('booking_date', new Date().toISOString().slice(0, 10))
            .order('booking_date', { ascending: true })
            .order('start_time', { ascending: true })
            .limit(10);

          if (myBookingErr || !myBookings || myBookings.length === 0) {
            await safeReplyMessage(replyToken, userId, {
              type: 'text',
              text: '目前沒有未來的預約紀錄。'
            });
            usedReplyTokens.add(replyToken);
            continue;
          }

          const bookingText = myBookings.map((b, idx) => {
            const facilityName = b.facilities?.name || '未命名設施';
            const start = String(b.start_time).slice(0, 5);
            const end = String(b.end_time).slice(0, 5);
            return `${idx + 1}. ${facilityName}\n   ${b.booking_date} ${start}-${end} (${b.status})`;
          }).join('\n\n');

          await safeReplyMessage(replyToken, userId, {
            type: 'text',
            text: `我的預約\n\n${bookingText}`
          });
          usedReplyTokens.add(replyToken);
          continue;
        }

        if (isCancelBookingText) {
          if (!existingProfile?.id) {
            await safeReplyMessage(replyToken, userId, {
              type: 'text',
              text: '尚未完成住戶綁定，暫時無法取消預約。'
            });
            usedReplyTokens.add(replyToken);
            continue;
          }

          const { data: cancellableBookings, error: cancelQueryErr } = await supabase
            .from('facility_bookings')
            .select('id, booking_date, start_time, end_time, points_spent, facilities(name)')
            .eq('user_id', existingProfile.id)
            .eq('status', 'confirmed')
            .gte('booking_date', new Date().toISOString().slice(0, 10))
            .order('booking_date', { ascending: true })
            .order('start_time', { ascending: true })
            .limit(8);

          if (cancelQueryErr || !cancellableBookings || cancellableBookings.length === 0) {
            await safeReplyMessage(replyToken, userId, {
              type: 'text',
              text: '目前沒有可取消的預約。'
            });
            usedReplyTokens.add(replyToken);
            continue;
          }

          const cancelButtons = cancellableBookings.map((b) => ({
            type: 'button',
            style: 'secondary',
            action: {
              type: 'postback',
              label: `${b.facilities?.name || '設施'} ${b.booking_date} ${String(b.start_time).slice(0, 5)}`,
              data: `action=facility_cancel_booking&booking_id=${b.id}`,
              displayText: `取消預約 ${b.facilities?.name || ''}`.trim()
            }
          }));

          await safeReplyMessage(replyToken, userId, {
            type: 'flex',
            altText: '請選擇要取消的預約',
            contents: {
              type: 'bubble',
              body: {
                type: 'box',
                layout: 'vertical',
                contents: [
                  { type: 'text', text: '請選擇要取消的預約', weight: 'bold', size: 'md', wrap: true }
                ]
              },
              footer: {
                type: 'box',
                layout: 'vertical',
                spacing: 'sm',
                contents: cancelButtons
              }
            }
          });
          usedReplyTokens.add(replyToken);
          continue;
        }

        console.log('🔍 [DEBUG] 準備檢查熱門問題...');
        console.log('🔍 [DEBUG] userText 值:', userText);
        console.log('🔍 [DEBUG] userText 型別:', typeof userText);
        console.log('🔍 [DEBUG] 包含「熱門問題」?', userText.includes('熱門問題'));
        console.log('🔍 [DEBUG] 包含「排行榜」?', userText.includes('排行榜'));
        console.log('🔍 [DEBUG] 包含「常見問題」?', userText.includes('常見問題'));

        // 1️⃣ 熱門問題排行榜
        if (userText.includes('熱門問題') || userText.includes('排行榜') || userText.includes('常見問題')) {
          console.log('✅ [熱門問題] 進入熱門問題處理邏輯');
          try {
            // 直接在這裡查詢數據庫，避免 API 調用問題
            const { data, error } = await supabase
              .from('chat_log')
              .select('raw_question, intent')
              .not('raw_question', 'is', null)
              .not('raw_question', 'like', 'clarify:%') // 排除澄清選項
              .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()) // 最近30天
              .order('created_at', { ascending: false });

            let popularQuestions = [];

            if (!error && data?.length > 0) {
              // 改為按意圖分組統計，而不是按完整問題文字
              const intentStats = {};
              const intentExamples = {}; // 記錄每個意圖的示例問題
              
              data.forEach(record => {
                const intent = record.intent?.trim();
                const question = record.raw_question?.trim();
                
                if (intent && question && question.length > 0) {
                  if (intentStats[intent]) {
                    intentStats[intent].count++;
                  } else {
                    intentStats[intent] = { count: 1 };
                    intentExamples[intent] = question; // 記錄第一次出現的問題作為示例
                  }
                }
              });

              // 轉換為陣列並排序
              popularQuestions = Object.entries(intentStats)
                .map(([intent, stats]) => ({
                  raw_question: intentExamples[intent], // 使用示例問題
                  intent: intent,
                  question_count: stats.count
                }))
                .sort((a, b) => b.question_count - a.question_count)
                .slice(0, 5);
            }

            // 如果沒有數據，使用模擬數據
            if (popularQuestions.length === 0) {
              popularQuestions = [
                { raw_question: '包裹', intent: '包裹', question_count: 15 },
                { raw_question: '管理費', intent: '管費', question_count: 12 },
                { raw_question: '停車', intent: '停車', question_count: 8 },
                { raw_question: '公共設施', intent: '設施', question_count: 7 },
                { raw_question: '訪客', intent: '訪客', question_count: 6 }
              ];
            }

            let rankingMessage = '📊 熱門問題排行榜 (最近30天)\n\n';
            
            popularQuestions.forEach((item, index) => {
              const rank = index + 1;
              const emoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;
              const intent = item.intent ? `[${item.intent}]` : '';
              // 限制問題文字長度，避免過長
              const question = item.raw_question.length > 15 
                ? item.raw_question.substring(0, 15) + '...' 
                : item.raw_question;
              rankingMessage += `${emoji} ${question} ${intent}\n   詢問次數：${item.question_count} 次\n\n`;
            });
            
            rankingMessage += '💡 您也可以直接輸入這些關鍵字來獲得快速回答！';
            
            await client.replyMessage(replyToken, { type: 'text', text: rankingMessage });
            usedReplyTokens.add(replyToken);
          } catch (err) {
            console.error('❌ 熱門問題查詢失敗:', err);
            if (!usedReplyTokens.has(replyToken)) {
              await client.replyMessage(replyToken, { type: 'text', text: '熱門問題查詢失敗，請稍後再試。' });
              usedReplyTokens.add(replyToken);
            }
          }
          continue;
        }

        // 🔧 報修系統
        
        // 啟動報修流程（最優先處理，避免被舊 session 干擾）
        if (userText === '報修' || userText === '我要報修' || userText === '新報修') {
          console.log('[報修] ==================== 啟動新報修流程 ====================');
          
          // 清除舊的 session（如果有）
          const oldSession = repairSessions.get(userId);
          if (oldSession) {
            console.log('[報修] 偵測到舊 session，將被覆蓋:', oldSession);
          }
          
          // 初始化新的報修 session
          repairSessions.set(userId, {
            location: null,
            description: null,
            startTime: Date.now()
          });

          console.log('[報修] 新 session 已建立');

          try {
            await client.replyMessage(replyToken, {
              type: 'text',
              text: '📍 請輸入地點'
            });
            usedReplyTokens.add(replyToken); // 標記為已使用
            console.log('[報修] ✅ 啟動流程: 訊息回覆成功');
          } catch (replyErr) {
            console.error('[報修] ❌ 啟動流程: 訊息回覆失敗:', replyErr.message);
            console.error('[報修] 錯誤詳情:', {
              status: replyErr.response?.status,
              statusText: replyErr.response?.statusText,
              data: replyErr.response?.data
            });
          }
          continue;
        }
        
        // 檢查用戶是否在報修流程中
        const currentSession = repairSessions.get(userId);
        
        console.log('[報修] Session 狀態:', { 
          userId, 
          hasSession: !!currentSession,
          location: currentSession?.location,
          description: currentSession?.description
        });

        // 查詢我的報修記錄（必須完全匹配，避免與「我要報修」衝突）
        if (userText === '我的報修' || userText === '報修記錄' || userText === '報修查詢') {
          try {
            if (!existingProfile?.id) {
              await client.replyMessage(replyToken, {
                type: 'text',
                text: '⚠️ 尚未完成住戶綁定，暫時無法查詢報修記錄。'
              });
              usedReplyTokens.add(replyToken);
              continue;
            }

            const { data: repairs, error } = await supabase
              .from('maintenance')
              .select('id, status, created_at, equipment, item, description')
              .eq('reported_by_id', existingProfile.id)
              .in('status', ['open', 'progress', 'closed'])
              .order('created_at', { ascending: false })
              .limit(5);

            if (error || !repairs || repairs.length === 0) {
              await client.replyMessage(replyToken, {
                type: 'text',
                text: '📋 您目前沒有報修記錄\n\n輸入「報修」可以開始新的報修'
              });
              continue;
            }

            const statusEmoji = {
              open: '🟡 待處理',
              progress: '🔵 處理中',
              closed: '✅ 已完成'
            };

            let recordsText = '📋 您的報修記錄（最近5筆）\n\n';
            repairs.forEach((repair, index) => {
              const date = new Date(repair.created_at).toLocaleString('zh-TW', { 
                month: '2-digit', 
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
              });
              recordsText += `${index + 1}. 編號 #${String(repair.id).slice(0, 8)}\n`;
              recordsText += `   ${statusEmoji[repair.status] || repair.status}\n`;
              recordsText += `   ${repair.equipment || '未提供地點'}\n`;
              recordsText += `   ${(repair.item || '一般報修')} - ${(repair.description || '未提供描述')}\n`;
              recordsText += `   ${date}\n\n`;
            });

            recordsText += '💡 輸入「報修」可開始新的報修';

            await client.replyMessage(replyToken, {
              type: 'text',
              text: recordsText
            });
            usedReplyTokens.add(replyToken);
          } catch (err) {
            console.error('[報修] 查詢記錄失敗:', err);
            if (!usedReplyTokens.has(replyToken)) {
              await client.replyMessage(replyToken, {
                type: 'text',
                text: '❌ 查詢失敗，請稍後再試'
              });
              usedReplyTokens.add(replyToken);
            }
          }
          continue;
        }

        // 處理報修流程的各個步驟
        if (currentSession) {
          console.log('[報修] 進入報修流程處理:', { 
            userText, 
            location: currentSession.location, 
            description: currentSession.description,
            hasLocation: !!currentSession.location,
            hasDescription: !!currentSession.description
          });

          // 取消報修
          if (userText === '取消報修' || userText === '取消') {
            repairSessions.delete(userId);
            
            await client.replyMessage(replyToken, {
              type: 'text',
              text: '❌ 已取消報修流程'
            });
            continue;
          }

          // 步驟1: 輸入地點
          if (!currentSession.location) {
            console.log('[報修] 步驟1: 儲存地點:', userText);
            repairSessions.set(userId, {
              ...currentSession,
              location: userText
            });

            console.log('[報修] 地點已儲存到 session');

            try {
              await client.replyMessage(replyToken, {
                type: 'text',
                text: '📝 請簡單描述問題狀況'
              });
              usedReplyTokens.add(replyToken);
              console.log('[報修] 步驟1: 訊息回覆成功');
            } catch (replyErr) {
              console.error('[報修] 步驟1: 訊息回覆失敗:', replyErr.message);
            }
            continue;
          }

          // 步驟2: 輸入問題描述  
          if (currentSession.location && !currentSession.description) {
            console.log('[報修] 步驟2: 儲存描述:', userText);
            console.log('[報修] 當前地點:', currentSession.location);
            repairSessions.set(userId, {
              ...currentSession,
              description: userText
            });

            console.log('[報修] 描述已儲存到 session');

            try {
              await client.replyMessage(replyToken, {
                type: 'text',
                text: `✅ 問題描述：${userText}\n\n📸 請上傳問題照片\n（可直接拍照上傳，或輸入「略過」）\n\n輸入「取消報修」可中止流程`
              });
              usedReplyTokens.add(replyToken);
              console.log('[報修] 步驟2: 訊息回覆成功');
            } catch (replyErr) {
              console.error('[報修] 步驟2: 訊息回覆失敗:', replyErr.message);
            }
            continue;
          }

          // 步驟3: 略過照片，直接完成報修
          if (currentSession.location && currentSession.description && (userText === '略過' || userText === '跳過')) {
            console.log('[報修] 步驟3: 略過照片，提交報修');

            console.log('[報修] 提交前資料確認:', {
              location: currentSession.location,
              description: currentSession.description
            });
            
            // 直接寫入 maintenance（不使用草稿）
            const { data: completedRepair, error: insertError } = await supabase
              .from('maintenance')
              .insert([{
                equipment: currentSession.location,
                item: '一般報修',
                status: 'open',
                time: new Date().toISOString(),
                description: currentSession.description,
                image_url: null,
                reported_by_id: existingProfile?.id || null,
                created_by: existingProfile?.id || null,
                unit_id: existingProfile?.unit_id || null,
                reported_by_name: existingProfile?.name || existingProfile?.line_display_name || null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              }])
              .select('id, equipment, description')
              .maybeSingle();

            if (insertError || !completedRepair) {
              console.error('[報修] 提交失敗:', insertError);
              await client.replyMessage(replyToken, {
                type: 'text',
                text: '❌ 報修單提交失敗，請稍後再試'
              });
              usedReplyTokens.add(replyToken);
              continue;
            }
            
            // 清除 session
            repairSessions.delete(userId);
            
            const repair = completedRepair;
            await client.replyMessage(replyToken, {
              type: 'text',
              text: `✅ 報修已送出\n📌 編號：#${String(repair.id).slice(0, 8)}\n目前狀態：🟡 待處理\n\n📍 地點：${repair.equipment}\n📝 問題：${repair.description}\n\n管理單位會盡快處理，謝謝您的通報！`
            });
            usedReplyTokens.add(replyToken);
            continue;
          }

          // 步驟3: 等待照片上傳，任何其他輸入都提示上傳照片或略過（兜底邏輯）
          // 這確保有 session 時一定不會執行到 AI 查詢
          console.log('[報修] 兜底邏輯: 提示上傳照片');
          await client.replyMessage(replyToken, {
            type: 'text',
            text: '📷 請上傳問題照片\n或輸入「略過」跳過照片上傳\n\n您也可以輸入「取消報修」中止流程'
          });
          usedReplyTokens.add(replyToken);
          continue;
        }

        // 0️⃣ 投票訊息
        if (userText.includes('vote:')) {
          try {
            const parts = userText.split(':');
            if (parts.length < 3) {
              await client.replyMessage(replyToken, { type: 'text', text: '投票訊息格式錯誤' });
              usedReplyTokens.add(replyToken);
              continue;
            }

            const voteIdFromMsg = parts[1].trim();
            const option_selected = parts[2].replace('🗳️', '').trim();

            const { data: voteExists } = await supabase
              .from('votes')
              .select('id')
              .eq('id', voteIdFromMsg)
              .maybeSingle();

            if (!voteExists) {
              await client.replyMessage(replyToken, { type: 'text', text: '投票已過期或不存在' });
              usedReplyTokens.add(replyToken);
              continue;
            }

            const vote_id = voteExists.id;
            const user_id = existingProfile?.id;
            const user_name = existingProfile?.line_display_name;

            if (!user_id) {
              await client.replyMessage(replyToken, { type: 'text', text: '找不到住戶資料' });
              usedReplyTokens.add(replyToken);
              continue;
            }

            // 防止重複投票
            const { data: existingVote } = await supabase
              .from('vote_records')
              .select('id')
              .eq('vote_id', vote_id)
              .eq('user_id', user_id)
              .maybeSingle();

            if (existingVote) {
              await client.replyMessage(replyToken, { type: 'text', text: '您已經投過票' });
              usedReplyTokens.add(replyToken);
              continue;
            }

            const { error: voteError } = await supabase.from('vote_records').insert([{
              vote_id,
              user_id,
              user_name,
              option_selected,
              voted_at: new Date().toISOString()
            }]);

            if (voteError) {
              console.error('❌ 投票寫入失敗:', voteError);
              await client.replyMessage(replyToken, { type: 'text', text: '投票失敗' });
              usedReplyTokens.add(replyToken);
              continue;
            }

            await client.replyMessage(replyToken, { type: 'text', text: `確認，您的投票結果為「${option_selected}」` });
            usedReplyTokens.add(replyToken);
          } catch (err) {
            console.error('❌ 投票處理失敗:', err);
          }
          continue;
        }

        // ===== 檢查是否有進行中的緊急事件會話 =====
        const { data: activeSession, error: sessionCheckErr } = await supabase
          .from('emergency_sessions')
          .select('id, event_type, location, description, status, image_url')
          .eq('line_user_id', userId)
          .neq('status', 'submitted')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (sessionCheckErr) {
          console.error('❌ 查詢緊急事件會話失敗:', sessionCheckErr);
        }

        if (activeSession && cleanText !== '回報緊急事件') {
          try {
            // 在會話中：根據當前狀態，保存對應資訊
            if (activeSession.status === 'event_type') {
              const normalizedEventType = userText
                .replace(/^選擇[:：]\s*/, '')
                .trim();

              if (!normalizedEventType) {
                await client.replyMessage(replyToken, {
                  type: 'text',
                  text: '⚠️ 事件類型不可空白，請重新輸入。'
                });
                usedReplyTokens.add(replyToken);
                continue;
              }

              // 使用者輸入自訂事件類型
              const { error: updateErr } = await supabase
                .from('emergency_sessions')
                .update({
                  event_type: normalizedEventType,
                  status: 'location',
                  updated_at: new Date().toISOString()
                })
                .eq('id', activeSession.id);

              if (updateErr) throw updateErr;

              await client.replyMessage(replyToken, {
                type: 'text',
                text: `✅ 已選擇事件類型：${normalizedEventType}\n\n📍 請輸入事件地點（例如：A棟3樓、地下室等）`
              });
              usedReplyTokens.add(replyToken);
              continue;
            }

            if (activeSession.status === 'location') {
              // 使用者輸入地點
              const { error: updateErr } = await supabase
                .from('emergency_sessions')
                .update({
                  location: userText,
                  status: 'description',
                  updated_at: new Date().toISOString()
                })
                .eq('id', activeSession.id);

              if (updateErr) throw updateErr;

              await client.replyMessage(replyToken, {
                type: 'text',
                text: `✅ 地點已確認：${userText}\n\n📝 請輸入事件描述（盡量詳細）`
              });
              usedReplyTokens.add(replyToken);
              continue;
            }

            if (activeSession.status === 'description') {
              const normalizedDescription = userText.trim();

              if (!normalizedDescription) {
                await client.replyMessage(replyToken, {
                  type: 'text',
                  text: '⚠️ 事件描述不可空白，請重新輸入。'
                });
                usedReplyTokens.add(replyToken);
                continue;
              }

              const { error: saveDescErr } = await supabase
                .from('emergency_sessions')
                .update({
                  description: normalizedDescription,
                  status: 'confirm',
                  updated_at: new Date().toISOString()
                })
                .eq('id', activeSession.id)
                .eq('status', 'description');

              if (saveDescErr) throw saveDescErr;

              await client.replyMessage(replyToken, {
                type: 'text',
                text: '✅ 事件描述已記錄。\n📷 請上傳圖片，或輸入「略過」/「跳過」跳過照片上傳。'
              });
              usedReplyTokens.add(replyToken);
              continue;
            }

            if (activeSession.status === 'confirm') {
              if (userText === '略過' || userText === '跳過') {
                const confirmFlex = buildEmergencyConfirmFlex(
                  activeSession.id,
                  activeSession.event_type,
                  activeSession.location,
                  activeSession.description,
                  activeSession.image_url
                );

                await client.replyMessage(replyToken, confirmFlex);
                usedReplyTokens.add(replyToken);
                continue;
              }

              await client.replyMessage(replyToken, {
                type: 'text',
                text: '📷 請上傳圖片，或輸入「略過」/「跳過」後送出確認。\n若要重填請輸入「回報緊急事件」。'
              });
              usedReplyTokens.add(replyToken);
              continue;
            }
          } catch (sessionErr) {
            console.error('❌ 會話處理失敗:', sessionErr);
            await client.replyMessage(replyToken, {
              type: 'text',
              text: '❌ 處理失敗，請稍後重試。'
            });
            usedReplyTokens.add(replyToken);
            continue;
          }
        }

        // 0.4️⃣ 緊急事件送審 - 方案C：引導式 + 快速選項
        if (cleanText === '回報緊急事件') {
          try {
            // 清除舊的未完成會話
            await supabase
              .from('emergency_sessions')
              .delete()
              .eq('line_user_id', userId)
              .neq('status', 'submitted');

            // 建立新會話
            const { error: sessionErr } = await supabase
              .from('emergency_sessions')
              .insert([{
                line_user_id: userId,
                status: 'event_type'
              }]);

            if (sessionErr) {
              console.error('❌ 建立會話失敗:', sessionErr);
              await safeReplyMessage(replyToken, userId, {
                type: 'text',
                text: '❌ 發生錯誤，請稍後再試。'
              });
              usedReplyTokens.add(replyToken);
              continue;
            }

            // 推送事件類型選擇卡片
            const eventTypesFlex = {
              type: 'flex',
              altText: '🚨 請選擇事件類型',
              contents: {
                type: 'bubble',
                body: {
                  type: 'box',
                  layout: 'vertical',
                  spacing: 'md',
                  contents: [
                    {
                      type: 'text',
                      text: '🚨 請選擇事件類型',
                      weight: 'bold',
                      size: 'lg',
                      wrap: true
                    },
                    { type: 'separator', margin: 'md' },
                    {
                      type: 'text',
                      text: '點擊下方按鈕或輸入自訂類型',
                      color: '#999999',
                      size: 'sm',
                      wrap: true
                    }
                  ]
                },
                footer: {
                  type: 'box',
                  layout: 'vertical',
                  spacing: 'sm',
                  contents: [
                    {
                      type: 'button',
                      style: 'primary',
                      color: '#E74C3C',
                      action: {
                        type: 'postback',
                        label: '🔥 火災',
                        data: 'action=select_event_type&type=火災',
                        displayText: '選擇：火災'
                      }
                    },
                    {
                      type: 'button',
                      style: 'primary',
                      color: '#3498DB',
                      action: {
                        type: 'postback',
                        label: '💧 水災',
                        data: 'action=select_event_type&type=水災',
                        displayText: '選擇：水災'
                      }
                    },
                    {
                      type: 'button',
                      style: 'primary',
                      color: '#F39C12',
                      action: {
                        type: 'postback',
                        label: '⚡ 停電',
                        data: 'action=select_event_type&type=停電',
                        displayText: '選擇：停電'
                      }
                    },
                    {
                      type: 'button',
                      style: 'primary',
                      color: '#9B59B6',
                      action: {
                        type: 'postback',
                        label: '🔧 設備故障',
                        data: 'action=select_event_type&type=設備故障',
                        displayText: '選擇：設備故障'
                      }
                    },
                    {
                      type: 'button',
                      style: 'primary',
                      color: '#EF4444',
                      action: {
                        type: 'postback',
                        label: '🕵️ 可疑人員',
                        data: 'action=select_event_type&type=可疑人員',
                        displayText: '選擇：可疑人員'
                      }
                    },
                    {
                      type: 'button',
                      style: 'secondary',
                      action: {
                        type: 'postback',
                        label: '⚠️ 其他',
                        data: 'action=show_other_types',
                        displayText: '查看其他選項'
                      }
                    }
                  ]
                }
              }
            };

            await safeReplyMessage(replyToken, userId, eventTypesFlex);
            usedReplyTokens.add(replyToken);
          } catch (err) {
            console.error('❌ 緊急事件初始化失敗:', err);
            await safeReplyMessage(replyToken, userId, {
              type: 'text',
              text: '❌ 發生錯誤，請稍後再試。'
            });
            usedReplyTokens.add(replyToken);
          }
          continue;
        }


        // 0.5️⃣ 查看最新投票
        if (cleanText === '查看最新投票') {
          try {
            const { data: latestVote, error: voteQueryError } = await supabase
              .from('votes')
              .select('id, title, description, options, created_at, ends_at, status')
              .eq('status', 'active')
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            if (voteQueryError) {
              console.error('❌ 查詢最新投票失敗:', voteQueryError);
              await client.replyMessage(replyToken, {
                type: 'text',
                text: '❌ 查詢最新投票失敗，請稍後再試。'
              });
              usedReplyTokens.add(replyToken);
              continue;
            }

            if (!latestVote) {
              await client.replyMessage(replyToken, {
                type: 'text',
                text: '📭 目前沒有進行中的投票。'
              });
              usedReplyTokens.add(replyToken);
              continue;
            }

            let optionsText = '未提供';
            if (Array.isArray(latestVote.options) && latestVote.options.length > 0) {
              optionsText = latestVote.options.join('、');
            } else if (typeof latestVote.options === 'string' && latestVote.options.trim()) {
              optionsText = latestVote.options;
            }

            const createdAtText = latestVote.created_at
              ? new Date(latestVote.created_at).toLocaleString('zh-TW', { hour12: false })
              : '未提供';
            const endsAtText = latestVote.ends_at
              ? new Date(latestVote.ends_at).toLocaleString('zh-TW', { hour12: false })
              : '未設定';
            const statusMap = {
              active: '🟢 進行中',
              closed: '⚪ 已結束'
            };
            const statusText = statusMap[latestVote.status] || latestVote.status || '未知';

            await client.replyMessage(replyToken, {
              type: 'text',
              text:
                `🗳️ 最新投票資訊\n` +
                `標題：${latestVote.title || '未提供'}\n` +
                `狀態：${statusText}\n` +
                `選項：${optionsText}\n` +
                `建立時間：${createdAtText}\n` +
                `截止時間：${endsAtText}\n` +
                `說明：${latestVote.description || '無'}`
            });
            usedReplyTokens.add(replyToken);
          } catch (err) {
            console.error('❌ 最新投票查詢例外:', err);
            if (!usedReplyTokens.has(replyToken)) {
              await client.replyMessage(replyToken, {
                type: 'text',
                text: '❌ 查詢最新投票失敗，請稍後再試。'
              });
              usedReplyTokens.add(replyToken);
            }
          }
          continue;
        }

        // 2️⃣ 公共設施
        if (userText.includes('公共設施')) {
          const carouselMessage = {
            type: 'flex',
            altText: '公共設施資訊',
            contents: {
              type: 'carousel',
              contents: [
                {
                  type: 'bubble',
                  hero: {
                    type: 'image',
                    url: 'https://today-obs.line-scdn.net/0h-NdfKUUZcmFZH1sCDogNNmNJcQ5qc2FiPSkjYhpxLFUjLjAzNSs8D3pKfgZ1KTU_Ny44D34WaVAmKjQ-ZSo8/w1200',
                    size: 'full',
                    aspectRatio: '20:13',
                    aspectMode: 'cover'
                  },
                  body: {
                    type: 'box',
                    layout: 'vertical',
                    contents: [{ type: 'text', text: '健身房\n開放時間：06:00 - 22:00', wrap: true }]
                  }
                },
                {
                  type: 'bubble',
                  hero: {
                    type: 'image',
                    url: 'https://www.ytyut.com/uploads/news/1000/3/d3156e6f-9126-46cd.jpg',
                    size: 'full',
                    aspectRatio: '20:13',
                    aspectMode: 'cover'
                  },
                  body: {
                    type: 'box',
                    layout: 'vertical',
                    contents: [{ type: 'text', text: '游泳池\n開放時間：08:00 - 20:00', wrap: true }]
                  }
                },
                {
                  type: 'bubble',
                  hero: {
                    type: 'image',
                    url: 'https://www.gogo-engineering.com/store_image/ydplan/file/D1695800312494.jpg',
                    size: 'full',
                    aspectRatio: '20:13',
                    aspectMode: 'cover'
                  },
                  body: {
                    type: 'box',
                    layout: 'vertical',
                    contents: [{ type: 'text', text: '大廳\n開放時間：全天', wrap: true }]
                  }
                }
              ]
            }
          };

          await client.replyMessage(replyToken, carouselMessage);
          usedReplyTokens.add(replyToken);
          continue;
        }

        // 1.5️⃣ 包裹最新狀態查詢（依 LINE 使用者綁定單位查最新一筆）
        const normalizedUserText = userText.replace(/[\s\n\r,，.。:：;；!！?？]/g, '');
        const isFeeQuery = normalizedUserText === '查詢我的管理費';
        const isPackageQuery = normalizedUserText === '查詢我的包裹';

        if (isFeeQuery) {
          try {
            // 優先使用本次已查到的 profile，必要時補查 unit_id
            let profileForFee = existingProfile;

            if (!profileForFee?.unit_id) {
              const { data: profileWithUnit } = await supabase
                .from('profiles')
                .select('id, name, unit_id')
                .eq('line_user_id', userId)
                .maybeSingle();

              if (profileWithUnit) {
                profileForFee = {
                  ...existingProfile,
                  ...profileWithUnit
                };
              }
            }

            if (!profileForFee?.unit_id) {
              await client.replyMessage(replyToken, {
                type: 'text',
                text: '⚠️ 尚未完成住戶綁定，暫時無法查詢管理費。\n請先完成 LINE 帳號綁定後再試一次。'
              });
              usedReplyTokens.add(replyToken);
              continue;
            }

            const { data: latestFee, error: feeError } = await supabase
              .from('fees')
              .select('*')
              .eq('unit_id', profileForFee.unit_id)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            if (feeError) {
              throw feeError;
            }

            if (!latestFee) {
              await client.replyMessage(replyToken, {
                type: 'text',
                text: '💰 目前查不到您的管理費資料。\n若您剛收到通知，請稍後再查詢。'
              });
              usedReplyTokens.add(replyToken);
              continue;
            }

            const { data: unitData } = await supabase
              .from('units')
              .select('unit_number, unit_code')
              .eq('id', profileForFee.unit_id)
              .maybeSingle();

            const roomText = unitData?.unit_number || unitData?.unit_code || '未提供';
            const amountText = latestFee.amount != null ? `NT$ ${latestFee.amount}` : '未提供';

            const dueDate = latestFee.due ? new Date(latestFee.due) : null;
            const dueText = dueDate && !Number.isNaN(dueDate.getTime())
              ? dueDate.toLocaleDateString('zh-TW')
              : (latestFee.due || '未提供');

            const invoiceText =
              latestFee.invoice ??
              latestFee.invoice_number ??
              latestFee.invoice_no ??
              latestFee.receipt_no ??
              '未提供';

            const feeStatusText = latestFee.paid === true
              ? '✅ 已繳費'
              : latestFee.paid === false
                ? '🟡 未繳費'
                : (latestFee.status ? `ℹ️ ${latestFee.status}` : '未提供');

            await client.replyMessage(replyToken, {
              type: 'text',
              text:
                `💰 您最新一筆管理費資訊\n` +
                `房號：${roomText}\n` +
                `金額：${amountText}\n` +
                `到期日：${dueText}\n` +
                `發票：${invoiceText}\n` +
                `繳費狀態：${feeStatusText}`
            });
            usedReplyTokens.add(replyToken);
          } catch (feeErr) {
            console.error('❌ 管理費查詢失敗:', feeErr);
            if (!usedReplyTokens.has(replyToken)) {
              await client.replyMessage(replyToken, {
                type: 'text',
                text: '❌ 管理費查詢失敗，請稍後再試。'
              });
              usedReplyTokens.add(replyToken);
            }
          }
          continue;
        }

        if (isPackageQuery) {
          try {
            // 優先使用本次已查到的 profile，必要時補查 unit_id
            let profileForPackage = existingProfile;

            if (!profileForPackage?.unit_id) {
              const { data: profileWithUnit } = await supabase
                .from('profiles')
                .select('id, name, unit_id')
                .eq('line_user_id', userId)
                .maybeSingle();

              if (profileWithUnit) {
                profileForPackage = {
                  ...existingProfile,
                  ...profileWithUnit
                };
              }
            }

            if (!profileForPackage?.unit_id) {
              await client.replyMessage(replyToken, {
                type: 'text',
                text: '⚠️ 尚未完成住戶綁定，暫時無法查詢包裹狀態。\n請先完成 LINE 帳號綁定後再試一次。'
              });
              usedReplyTokens.add(replyToken);
              continue;
            }

            const { data: latestPackage, error: packageError } = await supabase
              .from('packages')
              .select('id, courier, tracking_number, status, arrived_at, created_at, updated_at')
              .eq('unit_id', profileForPackage.unit_id)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            const { data: unitData } = await supabase
              .from('units')
              .select('unit_number, unit_code')
              .eq('id', profileForPackage.unit_id)
              .maybeSingle();

            if (packageError) {
              throw packageError;
            }

            if (!latestPackage) {
              await client.replyMessage(replyToken, {
                type: 'text',
                text: '📦 目前查不到您的包裹資料。\n若您剛收到通知，請稍後再查詢。'
              });
              usedReplyTokens.add(replyToken);
              continue;
            }

            const packageStatusMap = {
              pending: '🟡 未領取（待領取）',
              picked_up: '✅ 已領取',
            };

            const statusText = packageStatusMap[latestPackage.status] || `ℹ️ ${latestPackage.status || '未知狀態'}`;
            const arrivedAtText = latestPackage.arrived_at
              ? new Date(latestPackage.arrived_at).toLocaleString('zh-TW', { hour12: false })
              : '未提供';
            const roomText = unitData?.unit_number || unitData?.unit_code || '未提供';

            await client.replyMessage(replyToken, {
              type: 'text',
              text:
                `📦 您最新一筆包裹狀態\n` +
                `狀態：${statusText}\n` +
                `快遞公司：${latestPackage.courier || '未提供'}\n` +
                `房號：${roomText}\n` +
                `追蹤號碼：${latestPackage.tracking_number || '未提供'}\n` +
                `到件時間：${arrivedAtText}`
            });
            usedReplyTokens.add(replyToken);
          } catch (pkgErr) {
            console.error('❌ 包裹查詢失敗:', pkgErr);
            if (!usedReplyTokens.has(replyToken)) {
              await client.replyMessage(replyToken, {
                type: 'text',
                text: '❌ 包裹查詢失敗，請稍後再試。'
              });
              usedReplyTokens.add(replyToken);
            }
          }
          continue;
        }

        // 2️⃣ 其他問題 → 直接呼叫 chat 函數進行 AI 查詢
        try {
          // 再次檢查是否為系統提示訊息（雙重防護）
          // 先檢查 emoji
          if (userText.includes('📍') || userText.includes('🛠') || userText.includes('📷')) {
            console.log('[AI查詢] 偵測到報修提示 emoji，跳過 AI 查詢');
            continue;
          }
          
          const checkText = userText.replace(/[\s\n\r,，.。:：;；!！?？]/g, '').toLowerCase();
          const blockKeywords = [
            '請上傳照片', 
            '上傳照片並輸入', 
            '地點與問題說明', 
            '請輸入您想查詢',
            '上傳照片'
          ];
          
          const shouldBlock = blockKeywords.some(keyword => {
            const cleanKeyword = keyword.replace(/[\s\n\r,，.。:：;；!！?？]/g, '').toLowerCase();
            return checkText.includes(cleanKeyword);
          });
          
          if (shouldBlock) {
            console.log('[AI查詢] 偵測到系統提示訊息，跳過 AI 查詢');
            continue;
          }

          // LINE webhook event 的唯一 ID（有些版本欄位名稱不同）
          const eventId = event.webhookEventId || event.id || `${userId}_${Date.now()}`;
          console.log('[DEBUG] Event ID:', eventId);
          console.log('[DEBUG] Event 完整資料:', JSON.stringify(event, null, 2));
          
          // 防重複：檢查此 eventId 是否已處理過
          let chatLogId = null;
          if (eventId) {
            const { data: existingLog } = await supabase
              .from('chat_log')
              .select('id')
              .eq('event_id', eventId)
              .maybeSingle();
            
            if (existingLog) {
              console.log('[防重複] eventId 已存在，跳過處理:', eventId);
              continue;
            }
          }
          
          const result = await chat(userText);
          
          // ===== 處理追問澄清機制 =====
          if (result.needsClarification) {
            console.log('[追問] 觸發澄清機制');
            
            try {
              // 寫入 chat_log (需要追問的記錄)
              const logData = {
                raw_question: userText,
                normalized_question: result.normalized_question || userText,
                intent: result.intent || null,
                intent_confidence: typeof result.intent_confidence === 'number' ? result.intent_confidence : null,
                answered: false,
                needs_clarification: true,
                user_id: userId || null,
                event_id: eventId || null,
                created_at: new Date().toISOString(),
              };
              
              const { data: insertData, error: insertError } = await supabase
                .from('chat_log')
                .insert([logData])
                .select();
              
              if (insertError) {
                console.error('[追問] ❌ chat_log 寫入失敗:', insertError);
              } else if (insertData?.[0]) {
                chatLogId = insertData[0].id;
                console.log('[追問] ✅ chatLogId 已記錄:', chatLogId);
                
                // 記錄澄清選項到 clarification_options 表
                try {
                  const clarificationRecords = result.clarificationOptions.map((opt, index) => ({
                    chat_log_id: chatLogId,
                    option_label: opt.label,
                    option_value: opt.value,
                    display_order: index
                  }));
                  
                  const { error: optionsError } = await supabase
                    .from('clarification_options')
                    .insert(clarificationRecords);
                  
                  if (optionsError) {
                    console.error('[追問] ⚠️ clarification_options 寫入失敗:', optionsError);
                  }
                } catch (optErr) {
                  console.error('[追問] ⚠️ clarification_options 處理失敗:', optErr);
                }
              }
              
              // 建立 Quick Reply 訊息
              const clarificationMessage = {
                type: 'text',
                text: result.clarificationMessage,
                quickReply: {
                  items: result.clarificationOptions.map(opt => ({
                    type: 'action',
                    action: {
                      type: 'postback',
                      label: opt.label,
                      data: `action=clarify&value=${opt.value}`,
                      displayText: opt.label  // 用戶點擊後顯示的文字
                    }
                  }))
                }
              };
              
              await client.replyMessage(replyToken, clarificationMessage);
              usedReplyTokens.add(replyToken);
              console.log('[追問] ✅ 澄清選項已發送');
              continue;
            } catch (clarifyErr) {
              console.error('[追問] ❌ 發送澄清訊息失敗:', clarifyErr);
              // 澄清機制失敗時，回覆一般錯誤訊息
              if (!usedReplyTokens.has(replyToken)) {
                try {
                  await client.replyMessage(replyToken, { 
                    type: 'text', 
                    text: '抱歉，系統處理中遇到問題，請稍後再試或輸入更詳細的問題。' 
                  });
                  usedReplyTokens.add(replyToken);
                } catch (replyErr) {
                  console.error('[追問] ❌ 回覆錯誤訊息失敗:', replyErr.message);
                }
              }
              continue;
            }
          }
          
          // ===== 正常回答流程 =====
          const answer = result?.answer || '目前沒有找到相關資訊，請查看社區公告。';
          
          // 檢查是否為追問回應 (訊息以 clarify: 開頭)
          let clarificationParentId = null;
          if (userText.startsWith('clarify:')) {
            // 查找最近一次 needs_clarification = true 的記錄
            const { data: parentLog } = await supabase
              .from('chat_log')
              .select('id')
              .eq('user_id', userId)
              .eq('needs_clarification', true)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            
            if (parentLog) {
              clarificationParentId = parentLog.id;
              console.log('[追問] 這是澄清回應，parent_id:', clarificationParentId);
              
              // 更新 clarification_options，標記使用者選擇的選項
              await supabase
                .from('clarification_options')
                .update({ selected: true, selected_at: new Date().toISOString() })
                .eq('chat_log_id', clarificationParentId)
                .eq('option_value', userText);
            }
          }

          
          // 寫入 chat_log
          const logData = {
            raw_question: userText,
            normalized_question: result.normalized_question || userText,
            intent: result.intent || null,
            intent_confidence: typeof result.intent_confidence === 'number' ? result.intent_confidence : null,
            answered: typeof result.answered === 'boolean' ? result.answered : (result.answer ? true : false),
            needs_clarification: false,
            clarification_parent_id: clarificationParentId,
            user_id: userId || null,
            event_id: eventId || null,
            created_at: new Date().toISOString(),
          };

          
          const { data: insertData, error: insertError } = await supabase
            .from('chat_log')
            .insert([logData])
            .select();
          
          console.log('[DEBUG] Insert result:', insertData);
          console.log('[DEBUG] Insert error:', insertError);
          
          if (!insertError && insertData?.[0]) {
            chatLogId = insertData[0].id;
            console.log('[DEBUG] chatLogId 已取得:', chatLogId);
          } else {
            console.error('[ERROR] 無法取得 chatLogId, insertError:', insertError);
          }
          
          // 只有在有 chatLogId 時才建立回饋按鈕
          let replyMessage;
          if (chatLogId) {
            // 建立帶回饋按鈕的訊息
            replyMessage = {
              type: 'text',
              text: answer.trim() + '\n\n這個回答有幫助到你嗎？',
              quickReply: {
                items: [
                  {
                    type: 'action',
                    action: {
                      type: 'postback',
                      label: '👍 有幫助',
                      data: `action=feedback&type=helpful&chatLogId=${chatLogId}`,
                      displayText: '👍 有幫助'
                    }
                  },
                  {
                    type: 'action',
                    action: {
                      type: 'postback',
                      label: '🤔 不太清楚',
                      data: `action=feedback&type=unclear&chatLogId=${chatLogId}`,
                      displayText: '🤔 不太清楚'
                    }
                  },
                  {
                    type: 'action',
                    action: {
                      type: 'postback',
                      label: '👎 沒幫助',
                      data: `action=feedback&type=not_helpful&chatLogId=${chatLogId}`,
                      displayText: '👎 沒幫助'
                    }
                  }
                ]
              }
            };
          } else {
            // 沒有 chatLogId，只回覆純文字
            console.warn('[WARNING] 沒有 chatLogId，只回覆純文字');
            replyMessage = {
              type: 'text',
              text: answer.trim()
            };
          }
          
          await client.replyMessage(replyToken, replyMessage);
          usedReplyTokens.add(replyToken); // 標記為已使用
          console.log('✅ LLM 查詢回覆成功');
        } catch (err) {
          console.error('❌ 查詢 LLM API 失敗:', err);
          // 檢查 replyToken 是否已使用
          if (!usedReplyTokens.has(replyToken)) {
            try {
              await client.replyMessage(replyToken, { type: 'text', text: '查詢失敗，請稍後再試。' });
              usedReplyTokens.add(replyToken);
            } catch (replyErr) {
              console.error('回覆錯誤訊息失敗:', replyErr.message);
            }
          } else {
            console.warn('⚠️ replyToken 已使用，無法回覆錯誤訊息');
          }
        }
      }
      
      // --- 3. 處理圖片訊息（報修照片上傳） ---
      if (event.type === 'message' && event.message.type === 'image') {
        const replyToken = event.replyToken;
        const messageId = event.message.id;

        console.log('[報修-圖片] ==================== 開始處理圖片 ====================');
        console.log('[報修-圖片] userId:', userId);
        console.log('[報修-圖片] messageId:', messageId);
        console.log('[報修-圖片] repairSessions 總數:', repairSessions.size);
        console.log('[報修-圖片] 所有 sessions:', Array.from(repairSessions.entries()));

        // 緊急事件流程的圖片上傳（優先處理，避免誤判成報修）
        try {
          const { data: activeEmergencySession } = await supabase
            .from('emergency_sessions')
            .select('id, status, event_type, location, description')
            .eq('line_user_id', userId)
            .neq('status', 'submitted')
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (activeEmergencySession) {
            const uploadedImageUrl = await uploadEmergencyImageFromLineMessage(messageId, userId);

            const { error: saveImageErr } = await supabase
              .from('emergency_sessions')
              .update({
                image_url: uploadedImageUrl,
                updated_at: new Date().toISOString()
              })
              .eq('id', activeEmergencySession.id);

            if (saveImageErr) {
              console.error('❌ 緊急事件圖片保存失敗:', saveImageErr);
              await safeReplyMessage(replyToken, userId, {
                type: 'text',
                text: '❌ 圖片上傳失敗，請稍後再試。'
              });
              usedReplyTokens.add(replyToken);
              continue;
            }

            let nextStepText = '✅ 圖片已附加到本次緊急事件。';
            if (activeEmergencySession.status === 'event_type') {
              nextStepText += '\n請先選擇或輸入事件類型。';
            } else if (activeEmergencySession.status === 'location') {
              nextStepText += '\n請繼續輸入事件地點。';
            } else if (activeEmergencySession.status === 'description') {
              nextStepText += '\n請繼續輸入事件描述。';
            } else if (activeEmergencySession.status === 'confirm') {
              const confirmFlex = buildEmergencyConfirmFlex(
                activeEmergencySession.id,
                activeEmergencySession.event_type,
                activeEmergencySession.location,
                activeEmergencySession.description,
                uploadedImageUrl
              );
              await safeReplyMessage(replyToken, userId, [
                { type: 'text', text: nextStepText },
                confirmFlex
              ]);
              usedReplyTokens.add(replyToken);
              continue;
            }

            await safeReplyMessage(replyToken, userId, {
              type: 'text',
              text: nextStepText
            });
            usedReplyTokens.add(replyToken);
            continue;
          }
        } catch (emergencyImageErr) {
          console.error('❌ 緊急事件圖片處理失敗:', emergencyImageErr);
          if (!usedReplyTokens.has(replyToken)) {
            let emergencyImageErrorText = '❌ 圖片處理失敗，請稍後再試。';
            if (emergencyImageErr?.code === 'HEIF_CONVERT_FAILED') {
              emergencyImageErrorText = '❌ HEIF 圖片轉檔失敗，請重新上傳 JPG/PNG 圖片。';
            } else if (emergencyImageErr?.code === 'UNSUPPORTED_IMAGE_FORMAT') {
              emergencyImageErrorText = '⚠️ 目前僅支援 JPG/PNG 圖片，請重新上傳。';
            } else if (emergencyImageErr?.code === 'STORAGE_UPLOAD_FAILED') {
              emergencyImageErrorText = '❌ 圖片儲存失敗，請稍後再試；若持續發生請通知管理單位檢查上傳權限設定。';
            }
            await safeReplyMessage(replyToken, userId, {
              type: 'text',
              text: emergencyImageErrorText
            });
            usedReplyTokens.add(replyToken);
          }
          continue;
        }

        // 檢查是否在報修流程中（已填寫地點和描述）
        const currentSession = repairSessions.get(userId);

        console.log('[報修-圖片] Session 狀態:', {
          hasSession: !!currentSession,
          location: currentSession?.location,
          description: currentSession?.description
        });

        // 檢查 session 是否完整（地點和描述都存在）
        const hasLocation = currentSession?.location && currentSession.location.trim() !== '';
        const hasDescription = currentSession?.description && currentSession.description.trim() !== '';

        if (currentSession && hasLocation && hasDescription) {
          console.log('[報修-圖片] ✅ Session 完整，開始提交報修');
          try {
            const maintenanceImageUrl = await uploadMaintenanceImageFromLineMessage(messageId, userId);

            // 直接寫入 maintenance（含圖片）
            const { data: completedRepair, error: insertError } = await supabase
              .from('maintenance')
              .insert([{
                equipment: currentSession.location,
                item: '一般報修',
                status: 'open',
                time: new Date().toISOString(),
                description: currentSession.description,
                image_url: maintenanceImageUrl,
                reported_by_id: existingProfile?.id || null,
                created_by: existingProfile?.id || null,
                unit_id: existingProfile?.unit_id || null,
                reported_by_name: existingProfile?.name || existingProfile?.line_display_name || null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              }])
              .select('id, equipment, description')
              .maybeSingle();

            if (insertError || !completedRepair) {
              console.error('[報修-圖片] 提交報修單失敗:', insertError);
              await client.replyMessage(replyToken, {
                type: 'text',
                text: '❌ 報修單提交失敗，請稍後再試'
              });
              continue;
            }

            const repair = completedRepair;

            console.log('[報修-圖片] ✅ 報修提交成功:', repair.id);

            // 清除 session
            repairSessions.delete(userId);

            // 回覆成功訊息
            await client.replyMessage(replyToken, {
              type: 'text',
              text: `✅ 報修已送出\n📌 編號：#${String(repair.id).slice(0, 8)}\n目前狀態：🟡 待處理\n\n📍 地點：${repair.equipment}\n📝 問題：${repair.description}\n📸 已附上照片\n\n管理單位會盡快處理，謝謝您的通報！`
            });
            usedReplyTokens.add(replyToken); // 標記為已使用
            console.log('[報修-圖片] ✅ 訊息回覆成功');
          } catch (err) {
            console.error('[報修-圖片] ❌ 處理照片失敗:', err);
            // 檢查 replyToken 是否已使用
            if (!usedReplyTokens.has(replyToken)) {
              try {
                await client.replyMessage(replyToken, {
                  type: 'text',
                  text: '❌ 照片處理失敗，請稍後再試'
                });
                usedReplyTokens.add(replyToken);
              } catch (replyErr) {
                console.error('[報修-圖片] 回覆錯誤訊息失敗:', replyErr.message);
              }
            } else {
              console.warn('[報修-圖片] ⚠️ replyToken 已使用，無法回覆錯誤訊息');
            }
          }
          continue;
        }

        // 沒有 session，檢查是否有最近提交的報修單（5分鐘內），用於補圖
        console.log('[報修-圖片] 沒有 session，檢查最近的報修單');
        try {
          const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
          const { data: recentRepairs, error: queryError } = await supabase
            .from('maintenance')
            .select('id, equipment, description, status, image_url')
            .eq('reported_by_id', existingProfile?.id || '')
            .eq('status', 'open')
            .is('image_url', null)
            .gte('created_at', fiveMinutesAgo)
            .order('created_at', { ascending: false })
            .limit(1);

          if (queryError) {
            console.error('[報修-圖片] 查詢最近報修失敗:', queryError);
            throw queryError;
          }

          if (recentRepairs && recentRepairs.length > 0) {
            const repair = recentRepairs[0];
            console.log('[報修-圖片] 找到最近的報修單:', repair.id);

            // 將圖片附加到這個 maintenance 單
            const imageUrl = await uploadMaintenanceImageFromLineMessage(messageId, userId);
            const { error: imageError } = await supabase
              .from('maintenance')
              .update({
                image_url: imageUrl,
                updated_at: new Date().toISOString()
              })
              .eq('id', repair.id)
              .eq('reported_by_id', existingProfile?.id || '');

            if (imageError) {
              console.error('[報修-圖片] 圖片儲存失敗:', imageError);
              await client.replyMessage(replyToken, {
                type: 'text',
                text: '❌ 照片上傳失敗，請稍後再試'
              });
              continue;
            }

            console.log('[報修-圖片] ✅ 圖片已附加到報修單');
            await client.replyMessage(replyToken, {
              type: 'text',
              text: `✅ 圖片已補上\n📌 編號：#${String(repair.id).slice(0, 8)}\n目前狀態：🟡 待處理\n\n📍 地點：${repair.equipment}\n📝 問題：${repair.description}\n📸 已附上照片\n\n管理單位會盡快處理，謝謝您的通報！`
            });
            continue;
          }
        } catch (err) {
          console.error('[報修-圖片] 處理最近報修單失敗:', err);
        }

        // 非報修流程的圖片訊息，回覆提示
        console.log('[報修-圖片] ❌ 非報修流程或找不到相關報修單');
        await client.replyMessage(replyToken, {
          type: 'text',
          text: '📸 收到圖片了！\n目前系統主要支援文字查詢。\n如需報修並上傳照片，請先輸入「報修」。'
        });
        continue;
      }
      
      // --- 4. 處理 postback 事件（回饋按鈕 + 澄清選項） ---
      if (event.type === 'postback') {
        const data = event.postback.data;
        const replyToken = event.replyToken;
        
        console.log('[DEBUG Postback] 原始 data:', data);
        
        // 解析 postback data
        const params = new URLSearchParams(data);
        const action = params.get('action');
        const emergencyEventId = params.get('event_id');
        
        console.log('[DEBUG Postback] action:', action);

        // ===== 設施預約（MVP） =====
        if (action === 'facility_start_booking') {
          const { data: facilities, error: facilityQueryErr } = await supabase
            .from('facilities')
            .select('id, name, location, capacity, base_price, available')
            .eq('available', true)
            .order('name', { ascending: true })
            .limit(10);

          if (facilityQueryErr || !facilities || facilities.length === 0) {
            await safeReplyMessage(replyToken, userId, {
              type: 'text',
              text: '目前沒有可預約的設施，請稍後再試。'
            });
            continue;
          }

          const bubbles = facilities.map((f) => ({
            type: 'bubble',
            body: {
              type: 'box',
              layout: 'vertical',
              spacing: 'sm',
              contents: [
                { type: 'text', text: f.name, weight: 'bold', size: 'lg', wrap: true },
                { type: 'text', text: `地點：${f.location || '未提供'}`, size: 'sm', color: '#666666', wrap: true },
                { type: 'text', text: `容量：${f.capacity || 1} 人`, size: 'sm', color: '#666666', wrap: true },
                { type: 'text', text: `費用：${f.base_price || 0} 點`, size: 'sm', color: '#666666', wrap: true }
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
                    type: 'postback',
                    label: '選擇此設施',
                    data: `action=facility_select&facility_id=${f.id}`,
                    displayText: `選擇設施：${f.name}`
                  }
                }
              ]
            }
          }));

          await safeReplyMessage(replyToken, userId, {
            type: 'flex',
            altText: '請選擇要預約的設施',
            contents: { type: 'carousel', contents: bubbles }
          });
          continue;
        }

        if (action === 'facility_my_bookings') {
          if (!existingProfile?.id) {
            await safeReplyMessage(replyToken, userId, {
              type: 'text',
              text: '尚未完成住戶綁定，暫時無法查詢預約。'
            });
            continue;
          }

          const { data: myBookings, error: myBookingErr } = await supabase
            .from('facility_bookings')
            .select('id, booking_date, start_time, end_time, status, facilities(name)')
            .eq('user_id', existingProfile.id)
            .in('status', ['confirmed', 'waitlisted'])
            .gte('booking_date', new Date().toISOString().slice(0, 10))
            .order('booking_date', { ascending: true })
            .order('start_time', { ascending: true })
            .limit(10);

          if (myBookingErr || !myBookings || myBookings.length === 0) {
            await safeReplyMessage(replyToken, userId, {
              type: 'text',
              text: '目前沒有未來的預約紀錄。'
            });
            continue;
          }

          const bookingText = myBookings.map((b, idx) => {
            const facilityName = b.facilities?.name || '未命名設施';
            const start = String(b.start_time).slice(0, 5);
            const end = String(b.end_time).slice(0, 5);
            return `${idx + 1}. ${facilityName}\n   ${b.booking_date} ${start}-${end} (${b.status})`;
          }).join('\n\n');

          await safeReplyMessage(replyToken, userId, {
            type: 'text',
            text: `我的預約\n\n${bookingText}`
          });
          continue;
        }

        if (action === 'facility_cancel_menu') {
          if (!existingProfile?.id) {
            await safeReplyMessage(replyToken, userId, {
              type: 'text',
              text: '尚未完成住戶綁定，暫時無法取消預約。'
            });
            continue;
          }

          const { data: cancellableBookings, error: cancelQueryErr } = await supabase
            .from('facility_bookings')
            .select('id, booking_date, start_time, end_time, facilities(name)')
            .eq('user_id', existingProfile.id)
            .eq('status', 'confirmed')
            .gte('booking_date', new Date().toISOString().slice(0, 10))
            .order('booking_date', { ascending: true })
            .order('start_time', { ascending: true })
            .limit(8);

          if (cancelQueryErr || !cancellableBookings || cancellableBookings.length === 0) {
            await safeReplyMessage(replyToken, userId, {
              type: 'text',
              text: '目前沒有可取消的預約。'
            });
            continue;
          }

          const cancelButtons = cancellableBookings.map((b) => ({
            type: 'button',
            style: 'secondary',
            action: {
              type: 'postback',
              label: `${b.facilities?.name || '設施'} ${b.booking_date} ${String(b.start_time).slice(0, 5)}`,
              data: `action=facility_cancel_booking&booking_id=${b.id}`,
              displayText: `取消預約 ${b.facilities?.name || ''}`.trim()
            }
          }));

          await safeReplyMessage(replyToken, userId, {
            type: 'flex',
            altText: '請選擇要取消的預約',
            contents: {
              type: 'bubble',
              body: {
                type: 'box',
                layout: 'vertical',
                contents: [
                  { type: 'text', text: '請選擇要取消的預約', weight: 'bold', size: 'md', wrap: true }
                ]
              },
              footer: {
                type: 'box',
                layout: 'vertical',
                spacing: 'sm',
                contents: cancelButtons
              }
            }
          });
          continue;
        }

        if (action === 'facility_select') {
          const facilityId = params.get('facility_id');
          const { data: facilityInfo, error: facilityErr } = await supabase
            .from('facilities')
            .select('id, name')
            .eq('id', facilityId)
            .eq('available', true)
            .maybeSingle();

          if (facilityErr || !facilityInfo) {
            await safeReplyMessage(replyToken, userId, {
              type: 'text',
              text: '此設施目前不可預約，請改選其他設施。'
            });
            continue;
          }

          facilityBookingSessions.set(userId, {
            step: 'await_date',
            facilityId: facilityInfo.id,
            facilityName: facilityInfo.name
          });

          await safeReplyMessage(replyToken, userId, {
            type: 'text',
            text: `已選擇設施：${facilityInfo.name}\n請輸入預約日期（YYYY-MM-DD），例如 2026-04-05。\n輸入「取消」可中止流程。`
          });
          continue;
        }

        if (action === 'facility_cancel_booking') {
          const bookingId = params.get('booking_id');
          if (!existingProfile?.id) {
            await safeReplyMessage(replyToken, userId, {
              type: 'text',
              text: '尚未完成住戶綁定，暫時無法取消預約。'
            });
            continue;
          }

          const { data: cancelledBooking, error: cancelErr } = await supabase
            .from('facility_bookings')
            .select('id, points_spent')
            .eq('id', bookingId)
            .eq('user_id', existingProfile.id)
            .in('status', ['confirmed', 'waitlisted'])
            .maybeSingle();

          if (cancelErr || !cancelledBooking) {
            await safeReplyMessage(replyToken, userId, {
              type: 'text',
              text: '取消失敗，可能此預約已被取消或不存在。'
            });
            continue;
          }

          const refundPoints = Number(cancelledBooking.points_spent || 0);
          if (refundPoints > 0) {
            await supabase
              .from('profiles')
              .update({
                points_balance: Number(existingProfile.points_balance || 0) + refundPoints,
                updated_at: new Date().toISOString()
              })
              .eq('id', existingProfile.id);
          }

          await supabase
            .from('facility_bookings')
            .update({
              status: 'cancelled',
              updated_at: new Date().toISOString()
            })
            .eq('id', bookingId)
            .eq('user_id', existingProfile.id)
            .in('status', ['confirmed', 'waitlisted']);

          await safeReplyMessage(replyToken, userId, {
            type: 'text',
            text: refundPoints > 0
              ? `已取消該筆設施預約，並退回 ${refundPoints} 點。`
              : '已取消該筆設施預約。'
          });
          continue;
        }

        // ===== 處理緊急事件回報流程（方案C） =====
        if (action === 'select_event_type') {
          const eventType = params.get('type');
          try {
            // 更新會話：保存事件類型並移到下一步
            const { error: updateErr } = await supabase
              .from('emergency_sessions')
              .update({
                event_type: eventType,
                status: 'location',
                updated_at: new Date().toISOString()
              })
              .eq('line_user_id', userId)
              .eq('status', 'event_type');

            if (updateErr) {
              console.error('❌ 更新會話失敗:', updateErr);
              await client.replyMessage(replyToken, {
                type: 'text',
                text: '❌ 發生錯誤，請稍後重試。'
              });
              continue;
            }

            await client.replyMessage(replyToken, {
              type: 'text',
              text: `✅ 已選擇事件類型：${eventType}\n\n📍 請輸入事件地點（例如：A棟3樓、地下室等）`
            });
            continue;
          } catch (err) {
            console.error('❌ 事件類型選擇失敗:', err);
            await client.replyMessage(replyToken, {
              type: 'text',
              text: '❌ 發生錯誤，請稍後再試。'
            });
            continue;
          }
        }

        // 其他選項 - 顯示更多快速選項
        if (action === 'show_other_types') {
          try {
            const otherTypesFlex = {
              type: 'flex',
              altText: '📋 更多事件類型',
              contents: {
                type: 'bubble',
                body: {
                  type: 'box',
                  layout: 'vertical',
                  spacing: 'md',
                  contents: [
                    {
                      type: 'text',
                      text: '📋 更多事件類型',
                      weight: 'bold',
                      size: 'lg',
                      wrap: true
                    },
                    { type: 'separator', margin: 'md' },
                    {
                      type: 'text',
                      text: '點擊下方或直接輸入自訂類型',
                      color: '#999999',
                      size: 'sm',
                      wrap: true
                    }
                  ]
                },
                footer: {
                  type: 'box',
                  layout: 'vertical',
                  spacing: 'sm',
                  contents: [
                    {
                      type: 'button',
                      style: 'primary',
                      color: '#16A34A',
                      action: {
                        type: 'postback',
                        label: '🛗 電梯故障',
                        data: 'action=select_event_type&type=電梯故障',
                        displayText: '選擇：電梯故障'
                      }
                    },
                    {
                      type: 'button',
                      style: 'primary',
                      color: '#0891B2',
                      action: {
                        type: 'postback',
                        label: '🌡️ 空調故障',
                        data: 'action=select_event_type&type=空調故障',
                        displayText: '選擇：空調故障'
                      }
                    },
                    {
                      type: 'button',
                      style: 'primary',
                      color: '#DC2626',
                      action: {
                        type: 'postback',
                        label: '🔌 電路故障',
                        data: 'action=select_event_type&type=電路故障',
                        displayText: '選擇：電路故障'
                      }
                    },
                    {
                      type: 'button',
                      style: 'primary',
                      color: '#9333EA',
                      action: {
                        type: 'postback',
                        label: '🚪 安全門損壞',
                        data: 'action=select_event_type&type=安全門損壞',
                        displayText: '選擇：安全門損壞'
                      }
                    }
                  ]
                }
              }
            };

            await client.replyMessage(replyToken, otherTypesFlex);
            await client.pushMessage(userId, {
              type: 'text',
              text: '或直接輸入自訂事件類型（例如：漏水、垃圾堆積等）'
            });
            continue;
          } catch (err) {
            console.error('❌ 顯示其他類型失敗:', err);
            await client.replyMessage(replyToken, {
              type: 'text',
              text: '❌ 發生錯誤，請稍後再試。'
            });
            continue;
          }
        }

        // ===== 提交緊急事件 =====
        if (action === 'submit_emergency') {
          const sessionId = params.get('session_id');

          try {
            const nowIso = new Date().toISOString();

            // 原子鎖定：只有 status=confirm 的會話才能被提交，避免重複寫入
            const { data: session, error: sessionErr } = await supabase
              .from('emergency_sessions')
              .update({
                status: 'submitted',
                updated_at: nowIso
              })
              .eq('id', sessionId)
              .eq('line_user_id', userId)
              .eq('status', 'confirm')
              .select('id, event_type, location, description, image_url')
              .maybeSingle();

            if (sessionErr) {
              throw sessionErr;
            }

            if (!session) {
              await client.replyMessage(replyToken, {
                type: 'text',
                text: 'ℹ️ 這筆緊急事件已處理或已提交，請勿重複送出。'
              });
              usedReplyTokens.add(replyToken);
              continue;
            }

            // 寫入緊急報告
            const { data: createdEmergency, error: emergencyInsertError } = await supabase
              .from('emergency_reports_line')
              .insert([{
                reporter_line_user_id: userId,
                reporter_profile_id: existingProfile?.id || null,
                event_type: session.event_type,
                location: session.location,
                description: session.description || '未提供',
                image_url: session.image_url || null,
                status: 'pending',
                created_at: nowIso,
                updated_at: nowIso
              }])
              .select('id, event_type, location, description, image_url, status, created_at')
              .single();

            if (emergencyInsertError || !createdEmergency) {
              throw emergencyInsertError || new Error('寫入失敗');
            }

            // 查詢所有管委會（committee）
            const { data: admins, error: adminQueryError } = await supabase
              .from('profiles')
              .select('line_user_id, name')
              .eq('role', 'committee')
              .not('line_user_id', 'is', null);

            if (adminQueryError) {
              console.error('⚠️ 查詢管理員失敗，但通報已建立:', adminQueryError);
              await client.replyMessage(replyToken, {
                type: 'text',
                text: '✅ 緊急事件已送出。\n⚠️ 目前通知管委會失敗，請稍後確認管理員帳號設定。'
              });
              usedReplyTokens.add(replyToken);
              continue;
            }

            const adminTargets = Array.from(
              new Set((admins || []).map((a) => a.line_user_id).filter(Boolean))
            );

            if (adminTargets.length === 0) {
              console.warn('⚠️ 查無可通知的管理員 line_user_id，但通報已建立');
              await client.replyMessage(replyToken, {
                type: 'text',
                text: '✅ 緊急事件已送出。\n⚠️ 目前尚未設定可通知的管理員帳號。'
              });
              usedReplyTokens.add(replyToken);
              continue;
            }

            // 推送審核卡片給所有管委會
            const reviewBubble = {
              type: 'bubble',
              body: {
                type: 'box',
                layout: 'vertical',
                spacing: 'md',
                contents: [
                  { type: 'text', text: '⚠️ 緊急事件待審核', weight: 'bold', size: 'lg' },
                  { type: 'separator', margin: 'sm' },
                  { type: 'text', text: `類型：${createdEmergency.event_type}`, wrap: true },
                  { type: 'text', text: `地點：${createdEmergency.location}`, wrap: true },
                  { type: 'text', text: `描述：${createdEmergency.description}`, wrap: true },
                  { type: 'text', text: `附圖：${createdEmergency.image_url ? '有' : '無'}`, wrap: true },
                  { type: 'text', text: '請確認是否發布通知', color: '#666666', size: 'sm', wrap: true }
                ]
              },
              footer: {
                type: 'box',
                layout: 'vertical',
                spacing: 'sm',
                contents: [
                  {
                    type: 'button',
                    style: 'primary',
                    color: '#1E88E5',
                    action: {
                      type: 'postback',
                      label: '✅ 確認發布',
                      data: `action=approve&event_id=${createdEmergency.id}`,
                      displayText: `確認發布事件 ${createdEmergency.id}`
                    }
                  },
                  {
                    type: 'button',
                    style: 'secondary',
                    action: {
                      type: 'postback',
                      label: '❌ 駁回',
                      data: `action=reject&event_id=${createdEmergency.id}`,
                      displayText: `駁回事件 ${createdEmergency.id}`
                    }
                  }
                ]
              }
            };

            if (createdEmergency.image_url) {
              reviewBubble.hero = {
                type: 'image',
                url: createdEmergency.image_url,
                size: 'full',
                aspectRatio: '20:13',
                aspectMode: 'cover'
              };
            }

            const reviewFlex = {
              type: 'flex',
              altText: '⚠️ 緊急事件待審核',
              contents: reviewBubble
            };

            for (const adminLineId of adminTargets) {
              try {
                await client.pushMessage(adminLineId, reviewFlex);
              } catch (pushErr) {
                console.error('⚠️ 推送管理員審核卡片失敗:', adminLineId, pushErr);
              }
            }

            await client.replyMessage(replyToken, {
              type: 'text',
              text: '✅ 緊急事件已送出，已通知管委會審核。'
            });
            usedReplyTokens.add(replyToken);
            continue;
          } catch (err) {
            console.error('❌ 提交緊急事件失敗:', err);
            await client.replyMessage(replyToken, {
              type: 'text',
              text: '❌ 提交失敗，請稍後再試。'
            });
            usedReplyTokens.add(replyToken);
            continue;
          }
        }

        // ===== 取消緊急事件回報 =====
        if (action === 'cancel_emergency') {
          const sessionId = params.get('session_id');
          try {
            await supabase
              .from('emergency_sessions')
              .update({ status: 'submitted', updated_at: new Date().toISOString() })
              .eq('id', sessionId);

            await client.replyMessage(replyToken, {
              type: 'text',
              text: '已取消緊急事件回報。'
            });
            continue;
          } catch (err) {
            console.error('❌ 取消失敗:', err);
            await client.replyMessage(replyToken, {
              type: 'text',
              text: '❌ 取消失敗，請稍後再試。'
            });
            continue;
          }
        }

        // ===== 處理緊急事件審核（committee） =====
        if ((action === 'approve' || action === 'reject') && emergencyEventId) {
          try {
            // 檢查操作者是否為管委會（committee）
            const { data: adminProfile, error: adminProfileErr } = await supabase
              .from('profiles')
              .select('id, name, role')
              .eq('line_user_id', userId)
              .maybeSingle();

            if (adminProfileErr) {
              console.error('[Emergency Review] 查詢 committee 身分失敗:', adminProfileErr);
              await safeReplyMessage(replyToken, userId, {
                type: 'text',
                text: '❌ 審核失敗，請稍後再試。'
              });
              continue;
            }

            if (!adminProfile || adminProfile.role !== 'committee') {
              await safeReplyMessage(replyToken, userId, {
                type: 'text',
                text: '⛔ 您沒有審核權限。'
              });
              continue;
            }

            // 讀取事件
            const { data: emergencyEvent, error: eventQueryErr } = await supabase
              .from('emergency_reports_line')
              .select('id, event_type, location, description, image_url, status')
              .eq('id', emergencyEventId)
              .maybeSingle();

            if (eventQueryErr || !emergencyEvent) {
              console.error('[Emergency Review] 查詢事件失敗:', eventQueryErr);
              await safeReplyMessage(replyToken, userId, {
                type: 'text',
                text: '⚠️ 找不到此緊急事件，可能已被處理。'
              });
              continue;
            }

            if (emergencyEvent.status !== 'pending') {
              const statusLabelMap = {
                approved: '已發布',
                rejected: '已駁回',
                pending: '待審核'
              };
              const currentStatusLabel = statusLabelMap[emergencyEvent.status] || emergencyEvent.status;

              let duplicateReviewMessage = `ℹ️ 此事件目前為「${currentStatusLabel}」，無法重複審核。`;
              if (action === 'approve' && emergencyEvent.status === 'approved') {
                duplicateReviewMessage = 'ℹ️ 此事件已發布，無需重複確認。';
              } else if (action === 'reject' && emergencyEvent.status === 'rejected') {
                duplicateReviewMessage = 'ℹ️ 此事件已駁回，無需重複操作。';
              }

              await safeReplyMessage(replyToken, userId, {
                type: 'text',
                text: duplicateReviewMessage
              });
              continue;
            }

            const newStatus = action === 'approve' ? 'approved' : 'rejected';
            const { error: updateErr } = await supabase
              .from('emergency_reports_line')
              .update({
                status: newStatus,
                reviewed_by: adminProfile.id,
                reviewed_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              })
              .eq('id', emergencyEventId);

            if (updateErr) {
              console.error('[Emergency Review] 更新狀態失敗:', updateErr);
              await safeReplyMessage(replyToken, userId, {
                type: 'text',
                text: '❌ 審核更新失敗，請稍後再試。'
              });
              continue;
            }

            // 確認發布 -> 廣播給所有住戶
            if (action === 'approve') {
              const broadcastText =
                `🚨【緊急事件通知】\n` +
                `類型：${emergencyEvent.event_type || '未指定'}\n` +
                `地點：${emergencyEvent.location || '未指定'}\n` +
                `描述：${emergencyEvent.description || '未提供'}\n\n` +
                `請住戶留意安全並配合現場指示。`;

              if (emergencyEvent.image_url) {
                await client.broadcast([
                  { type: 'text', text: broadcastText },
                  {
                    type: 'image',
                    originalContentUrl: emergencyEvent.image_url,
                    previewImageUrl: emergencyEvent.image_url
                  }
                ]);
              } else {
                await client.broadcast({ type: 'text', text: broadcastText });
              }
              await safeReplyMessage(replyToken, userId, {
                type: 'text',
                text: '✅ 已確認發布，緊急事件通知已廣播給所有住戶。'
              });
              continue;
            }

            // 駁回
            await safeReplyMessage(replyToken, userId, {
              type: 'text',
              text: '❌ 已駁回此緊急事件，不會進行廣播。'
            });
            continue;
          } catch (reviewErr) {
            console.error('[Emergency Review] 處理失敗:', reviewErr);
            await safeReplyMessage(replyToken, userId, {
              type: 'text',
              text: '❌ 審核處理失敗，請稍後再試。'
            });
            continue;
          }
        }
        
        // ===== 處理澄清選項 =====
        if (action === 'clarify') {
          const clarifyValue = params.get('value');
          console.log('[DEBUG Postback] clarifyValue:', clarifyValue);
          
          try {
            // 直接呼叫 chat 函數處理澄清選項
            const result = await chat(clarifyValue);
            
            // 根據結果建立回覆訊息（帶回饋按鈕）
            let replyMessage;
            if (result.answer) {
              replyMessage = {
                type: 'text',
                text: result.answer.trim()
              };
            } else {
              replyMessage = {
                type: 'text',
                text: '抱歉，目前找不到相關資訊。'
              };
            }
            
            await client.replyMessage(replyToken, replyMessage);
            continue;
          } catch (err) {
            console.error('[Postback Clarify Error]', err);
            await client.replyMessage(replyToken, { 
              type: 'text', 
              text: '查詢失敗，請稍後再試。' 
            });
            continue;
          }
        }
        
        // ===== 處理回饋按鈕 =====
        const chatLogId = params.get('chatLogId');
        const feedbackType = params.get('type');
        
        console.log('[DEBUG Postback] chatLogId:', chatLogId, 'type:', typeof chatLogId);
        console.log('[DEBUG Postback] feedbackType:', feedbackType);
        
        if (action === 'feedback' && chatLogId) {
          const chatLogIdInt = parseInt(chatLogId);
          console.log('[DEBUG Postback] chatLogIdInt:', chatLogIdInt);
          
          try {
            // 先檢查是否已經提交過回饋
            const { data: existingFeedback } = await supabase
              .from('chat_feedback')
              .select('id, feedback_type')
              .eq('chat_log_id', chatLogIdInt)
              .eq('user_id', userId)
              .maybeSingle();
            
            if (existingFeedback) {
              console.log('[DEBUG Postback] 用戶已提交過回饋，跳過');
              await client.replyMessage(replyToken, { 
                type: 'text', 
                text: '您已經提交過回饋了，謝謝！😊' 
              });
              continue;
            }
            
            // 記錄回饋到 chat_feedback
            const { data: insertedFeedback, error: feedbackError } = await supabase
              .from('chat_feedback')
              .insert([{
                chat_log_id: chatLogIdInt,
                user_id: userId,
                feedback_type: feedbackType,
                created_at: new Date().toISOString()
              }])
              .select();
            
            console.log('[DEBUG Postback] Insert result:', insertedFeedback);
            console.log('[DEBUG Postback] Insert error:', feedbackError);
            
            if (feedbackError) {
              console.error('[Feedback Error]', feedbackError);
              await client.replyMessage(replyToken, { 
                type: 'text', 
                text: '回饋提交失敗，請稍後再試。' 
              });
              continue;
            }
            
            // 更新 chat_log
            const feedbackField = feedbackType === 'helpful' ? 'success_count' :
                                 feedbackType === 'unclear' ? 'unclear_count' : 'fail_count';
            
            const { data: chatLog } = await supabase
              .from('chat_log')
              .select('id, feedback, success_count, unclear_count, fail_count')
              .eq('id', chatLogId)
              .single();
            
            const updateData = {
              feedback: feedbackType,
              [feedbackField]: (chatLog?.[feedbackField] || 0) + 1
            };
            
            if (feedbackType === 'not_helpful') {
              updateData.answered = false;
            }
            
            await supabase
              .from('chat_log')
              .update(updateData)
              .eq('id', chatLogId);
            
            // 回覆訊息
            let responseText = '';
            if (feedbackType === 'helpful') {
              responseText = '感謝你的回饋！很高興能幫助到你 😊';
            } else if (feedbackType === 'unclear') {
              responseText = '好，我懂～讓我提供更多資訊給你。';
            } else if (feedbackType === 'not_helpful') {
              responseText = '了解，這題目前資料可能不完整 🙏\n我會回報給管理單位補齊資料。';
            }
            
            await client.replyMessage(replyToken, { type: 'text', text: responseText });
            usedReplyTokens.add(replyToken); // 標記為已使用
            console.log('[Postback] ✅ 回饋處理成功');
          } catch (err) {
            console.error('[Postback] ❌ 處理失敗:', err);
            // 檢查 replyToken 是否已使用
            if (!usedReplyTokens.has(replyToken)) {
              try {
                await client.replyMessage(replyToken, { 
                  type: 'text', 
                  text: '處理失敗，請稍後再試。' 
                });
                usedReplyTokens.add(replyToken);
              } catch (replyErr) {
                console.error('[Postback] 回覆錯誤訊息失敗:', replyErr.message);
              }
            } else {
              console.warn('[Postback] ⚠️ replyToken 已使用，無法回覆錯誤訊息');
            }
          }
        }
      }
    }

    return new Response('OK', { status: 200 });
  } catch (err) {
    console.error('Webhook error:', err);
    return new Response('Internal Server Error', { status: 500 });
  }
}

export async function GET() {
  return new Response('Method Not Allowed', { status: 405 });
}
