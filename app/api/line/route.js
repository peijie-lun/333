import { Client, validateSignature } from '@line/bot-sdk';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);
import { chat } from '../../../grokmain.js';
import 'dotenv/config';

export const runtime = 'nodejs';

const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new Client(lineConfig);// LINE Bot SDK 客戶端

// 移除圖片關鍵字攔截，讓所有查詢都進入 AI 處理
// const IMAGE_KEYWORDS = ['圖片', '設施', '游泳池', '健身房', '大廳'];
// 處理 LINE Webhook 請求
export async function POST(req) {
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
        .select('id, line_user_id, line_display_name, line_avatar_url, line_status_message')
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
        console.log('📩 使用者輸入長度:', userText.length);
        console.log('📩 包含 📍?:', userText.includes('📍'));
        console.log('📩 包含 🛠?:', userText.includes('🛠'));
        console.log('📩 包含 📷?:', userText.includes('📷'));

        // 🚫 優先檢查：如果包含報修相關 emoji，直接跳過
        if (userText.includes('📍') || userText.includes('🛠') || userText.includes('📷')) {
          console.log('⏭️ [EMOJI 檢測] 偵測到報修提示 emoji，不回覆');
          continue;
        }
        
        // 🚫 忽略特定的系統提示訊息，不做任何回覆
        // 完全移除空白、換行、標點符號後比對
        const cleanText = userText.replace(/[\s\n\r,，.。:：;；!！?？]/g, '').toLowerCase();
        
        console.log('[DEBUG] 清理後的文字:', cleanText);
        
        // 檢查是否包含忽略關鍵字（更嚴格的匹配）
        const ignoreKeywords = [
          '請輸入您想查詢的問題',
          '本系統可以',
          '請上傳照片',
          '上傳照片並輸入',
          '照片並輸入地點',
          '地點與問題說明',
          '地點：',
          '問題：',
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

        // 🔧 報修系統
        // 檢查用戶是否在報修流程中（草稿狀態）
        const { data: draftRepair } = await supabase
          .from('repairs')
          .select('*')
          .eq('user_id', userId)
          .eq('status', 'draft')
          .maybeSingle();

        // 啟動報修流程（精確匹配，避免與「我的報修」衝突）
        if ((userText === '報修' || userText === '我要報修' || userText === '新報修') && !draftRepair) {
          // 生成報修編號
          const today = new Date();
          const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
          const randomNum = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
          const repairCode = `R${dateStr}-${randomNum}`;

          // 直接在 repairs 表建立草稿記錄
          await supabase
            .from('repairs')
            .insert([{
              user_id: userId,
              repair_code: repairCode,
              status: 'draft',
              category: '一般報修',
              priority: 'medium',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }]);

          await client.replyMessage(replyToken, {
            type: 'text',
            text: '📍 請輸入地點'
          });
          continue;
        }

        // 查詢我的報修記錄（必須完全匹配，避免與「我要報修」衝突）
        if (userText === '我的報修' || userText === '報修記錄' || userText === '報修查詢') {
          try {
            const { data: repairs, error } = await supabase
              .from('repairs')
              .select('*')
              .eq('user_id', userId)
              .neq('status', 'draft')  // 排除草稿
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
              'pending': '🟡 待處理',
              'processing': '🔵 處理中',
              'completed': '✅ 已完成',
              'cancelled': '❌ 已取消'
            };

            let recordsText = '📋 您的報修記錄（最近5筆）\n\n';
            repairs.forEach((repair, index) => {
              const date = new Date(repair.created_at).toLocaleString('zh-TW', { 
                month: '2-digit', 
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
              });
              recordsText += `${index + 1}. 編號 ${repair.repair_code || '#' + repair.id}\n`;
              recordsText += `   ${statusEmoji[repair.status] || repair.status}\n`;
              recordsText += `   ${repair.building ? repair.building + ' - ' : ''}${repair.location}\n`;
              recordsText += `   ${date}\n\n`;
            });

            recordsText += '💡 輸入「報修」可開始新的報修';

            await client.replyMessage(replyToken, {
              type: 'text',
              text: recordsText
            });
          } catch (err) {
            console.error('[報修] 查詢記錄失敗:', err);
            await client.replyMessage(replyToken, {
              type: 'text',
              text: '❌ 查詢失敗，請稍後再試'
            });
          }
          continue;
        }

        // 處理報修流程的各個步驟
        if (draftRepair) {
          // 取消報修
          if (userText === '取消報修' || userText === '取消') {
            await supabase
              .from('repairs')
              .delete()
              .eq('user_id', userId)
              .eq('status', 'draft');
            
            await client.replyMessage(replyToken, {
              type: 'text',
              text: '❌ 已取消報修流程'
            });
            continue;
          }

          // 步驟1: 輸入地點
          if (!draftRepair.location) {
            await supabase
              .from('repairs')
              .update({
                location: userText,
                updated_at: new Date().toISOString()
              })
              .eq('user_id', userId)
              .eq('status', 'draft');

            await client.replyMessage(replyToken, {
              type: 'text',
              text: '📝 請簡單描述問題狀況'
            });
            continue;
          }

          // 步驟2: 輸入問題描述
          if (draftRepair.location && !draftRepair.description) {
            await supabase
              .from('repairs')
              .update({
                description: userText,
                updated_at: new Date().toISOString()
              })
              .eq('user_id', userId)
              .eq('status', 'draft');

            await client.replyMessage(replyToken, {
              type: 'text',
              text: `✅ 問題描述：${userText}\n\n� 請上傳問題照片\n（可直接拍照上傳，或輸入「略過」）\n\n輸入「取消報修」可中止流程`
            });
            continue;
          }

          // 步驟3: 略過照片，直接完成報修
          if (draftRepair.location && draftRepair.description && (userText === '略過' || userText === '跳過')) {
            // 更新草稿為正式報修
            const { data: completedRepair, error: updateError } = await supabase
              .from('repairs')
              .update({
                status: 'pending',
                updated_at: new Date().toISOString()
              })
              .eq('user_id', userId)
              .eq('status', 'draft')
              .select();

            if (updateError || !completedRepair || completedRepair.length === 0) {
              console.error('[報修] 提交失敗:', updateError);
              await client.replyMessage(replyToken, {
                type: 'text',
                text: '❌ 報修單提交失敗，請稍後再試'
              });
            } else {
              const repair = completedRepair[0];
              await client.replyMessage(replyToken, {
                type: 'text',
                text: `✅ 報修已送出\n📌 編號：${repair.repair_code}\n目前狀態：🟡 待處理\n\n📍 地點：${repair.location}\n📝 問題：${repair.description}\n\n管理單位會盡快處理，謝謝您的通報！`
              });
            }
            continue;
          }
        }

        // 0️⃣ 投票訊息
        if (userText.includes('vote:')) {
          try {
            const parts = userText.split(':');
            if (parts.length < 3) {
              await client.replyMessage(replyToken, { type: 'text', text: '投票訊息格式錯誤' });
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
              continue;
            }

            const vote_id = voteExists.id;
            const user_id = existingProfile?.id;
            const user_name = existingProfile?.line_display_name;

            if (!user_id) {
              await client.replyMessage(replyToken, { type: 'text', text: '找不到住戶資料' });
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
              continue;
            }

            await client.replyMessage(replyToken, { type: 'text', text: `確認，您的投票結果為「${option_selected}」` });
          } catch (err) {
            console.error('❌ 投票處理失敗:', err);
          }
          continue;
        }

        // 1️⃣ 熱門問題排行榜
        if (userText.includes('熱門問題') || userText.includes('排行榜') || userText.includes('常見問題')) {
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
          } catch (err) {
            console.error('❌ 熱門問題查詢失敗:', err);
            await client.replyMessage(replyToken, { type: 'text', text: '熱門問題查詢失敗，請稍後再試。' });
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
            
            if (!insertError && insertData?.[0]) {
              chatLogId = insertData[0].id;
              console.log('[追問] chatLogId 已記錄:', chatLogId);
              
              // 記錄澄清選項到 clarification_options 表
              const clarificationRecords = result.clarificationOptions.map((opt, index) => ({
                chat_log_id: chatLogId,
                option_label: opt.label,
                option_value: opt.value,
                display_order: index
              }));
              
              await supabase
                .from('clarification_options')
                .insert(clarificationRecords);
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
            continue;
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
        } catch (err) {
          console.error('查詢 LLM API 失敗:', err);
          // 只在 replyToken 尚未使用時才回覆
          try {
            await client.replyMessage(replyToken, { type: 'text', text: '查詢失敗，請稍後再試。' });
          } catch (replyErr) {
            console.error('回覆錯誤訊息失敗 (可能 token 已使用):', replyErr.message);
          }
        }
      }
      
      // --- 3. 處理圖片訊息（報修照片上傳） ---
      if (event.type === 'message' && event.message.type === 'image') {
        const replyToken = event.replyToken;
        const messageId = event.message.id;

        // 檢查是否在報修流程中（草稿狀態且已填寫地點和描述）
        const { data: draftRepair } = await supabase
          .from('repairs')
          .select('*')
          .eq('user_id', userId)
          .eq('status', 'draft')
          .maybeSingle();

        if (draftRepair && draftRepair.location && draftRepair.description) {
          try {
            // 更新草稿為正式報修
            const { data: completedRepair, error: updateError } = await supabase
              .from('repairs')
              .update({
                status: 'pending',
                updated_at: new Date().toISOString()
              })
              .eq('user_id', userId)
              .eq('status', 'draft')
              .select();

            if (updateError || !completedRepair || completedRepair.length === 0) {
              console.error('[報修] 提交報修單失敗:', updateError);
              await client.replyMessage(replyToken, {
                type: 'text',
                text: '❌ 報修單提交失敗，請稍後再試'
              });
              continue;
            }

            // 建立圖片記錄
            const repair = completedRepair[0];
            const imageUrl = `LINE_MESSAGE:${messageId}`; // 儲存 LINE 訊息 ID

            const { error: imageError } = await supabase
              .from('repair_images')
              .insert([{
                repair_id: repair.id,
                image_url: imageUrl,
                created_at: new Date().toISOString()
              }]);

            if (imageError) {
              console.error('[報修] 圖片儲存失敗:', imageError);
            }

            await client.replyMessage(replyToken, {
              type: 'text',
              text: `✅ 報修已送出\n📌 編號：${repair.repair_code}\n目前狀態：🟡 待處理\n\n📍 地點：${repair.location}\n📝 問題：${repair.description}\n📸 已附上照片\n\n管理單位會盡快處理，謝謝您的通報！`
            });
          } catch (err) {
            console.error('[報修] 處理照片失敗:', err);
            await client.replyMessage(replyToken, {
              type: 'text',
              text: '❌ 照片處理失敗，請重新上傳或輸入「略過」'
            });
          }
          continue;
        }

        // 非報修流程的圖片訊息，回覆提示
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
        
        console.log('[DEBUG Postback] action:', action);
        
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
          } catch (err) {
            console.error('[Postback Error]', err);
            // 嘗試回覆錯誤訊息（如果 replyToken 尚未使用）
            try {
              await client.replyMessage(replyToken, { 
                type: 'text', 
                text: '處理失敗，請稍後再試。' 
              });
            } catch (replyErr) {
              console.error('[Reply Error] replyToken 可能已使用:', replyErr.message);
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
