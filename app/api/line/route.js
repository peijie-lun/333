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

// 記憶體暫存報修會話資料（取代資料庫草稿）
const repairSessions = new Map();
// 結構：{ userId: { location: string, description: string, startTime: timestamp } }

// 追蹤已使用的 replyToken（防止重複處理）
const usedReplyTokens = new Set();

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
        .select('id, name, unit_id, line_user_id, line_display_name, line_avatar_url, line_status_message')
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
            const { data: repairs, error } = await supabase
              .from('repairs')
              .select('*')
              .eq('user_id', userId)
              .in('status', ['pending', 'processing', 'completed', 'cancelled'])  // 只顯示已提交的報修
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
            
            // 生成報修編號
            const today = new Date();
            const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
            const randomNum = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
            const repairCode = `R${dateStr}-${randomNum}`;
            
            console.log('[報修] 提交前資料確認:', {
              location: currentSession.location,
              description: currentSession.description,
              repair_code: repairCode
            });
            
            // 直接寫入資料庫為 pending 狀態（不使用草稿）
            const { data: completedRepair, error: insertError } = await supabase
              .from('repairs')
              .insert([{
                user_id: userId,
                repair_code: repairCode,
                status: 'pending',
                category: '一般報修',
                building: '未指定',
                location: currentSession.location,
                description: currentSession.description,
                priority: 'medium',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              }])
              .select();

            if (insertError || !completedRepair || completedRepair.length === 0) {
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
            
            const repair = completedRepair[0];
            await client.replyMessage(replyToken, {
              type: 'text',
              text: `✅ 報修已送出\n📌 編號：${repair.repair_code}\n目前狀態：🟡 待處理\n\n📍 地點：${repair.location}\n📝 問題：${repair.description}\n\n管理單位會盡快處理，謝謝您的通報！`
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
          .select('id, event_type, location, status')
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

              // 使用者輸入描述，顯示確認卡片
              const confirmFlex = {
                type: 'flex',
                altText: '📋 確認事件資訊',
                contents: {
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
                            text: `🔹 類型：${activeSession.event_type}`,
                            wrap: true,
                            size: 'sm',
                            color: '#666666'
                          },
                          {
                            type: 'text',
                            text: `🔹 地點：${activeSession.location}`,
                            wrap: true,
                            size: 'sm',
                            color: '#666666'
                          },
                          {
                            type: 'text',
                            text: `🔹 描述：${normalizedDescription}`,
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
                          data: `action=submit_emergency&session_id=${activeSession.id}`,
                          displayText: '確認提交緊急事件'
                        }
                      },
                      {
                        type: 'button',
                        style: 'secondary',
                        action: {
                          type: 'postback',
                          label: '❌ 取消',
                          data: `action=cancel_emergency&session_id=${activeSession.id}`,
                          displayText: '取消緊急事件回報'
                        }
                      }
                    ]
                  }
                }
              };

              await client.replyMessage(replyToken, confirmFlex);
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
              await client.replyMessage(replyToken, {
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

            await client.replyMessage(replyToken, eventTypesFlex);
            usedReplyTokens.add(replyToken);
          } catch (err) {
            console.error('❌ 緊急事件初始化失敗:', err);
            await client.replyMessage(replyToken, {
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
            // 生成報修編號
            const today = new Date();
            const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
            const randomNum = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
            const repairCode = `R${dateStr}-${randomNum}`;

            // 直接寫入資料庫為 pending 狀態
            const { data: completedRepair, error: insertError } = await supabase
              .from('repairs')
              .insert([{
                user_id: userId,
                repair_code: repairCode,
                status: 'pending',
                category: '一般報修',
                building: '未指定',
                location: currentSession.location,
                description: currentSession.description,
                priority: 'medium',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              }])
              .select();

            if (insertError || !completedRepair || completedRepair.length === 0) {
              console.error('[報修-圖片] 提交報修單失敗:', insertError);
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
              console.error('[報修-圖片] 圖片儲存失敗:', imageError);
              // 圖片儲存失敗不影響報修提交，繼續回覆成功訊息
            }

            console.log('[報修-圖片] ✅ 報修提交成功:', repair.repair_code);

            // 清除 session
            repairSessions.delete(userId);

            // 回覆成功訊息
            await client.replyMessage(replyToken, {
              type: 'text',
              text: `✅ 報修已送出\n📌 編號：${repair.repair_code}\n目前狀態：🟡 待處理\n\n📍 地點：${repair.location}\n📝 問題：${repair.description}\n📸 已附上照片\n\n管理單位會盡快處理，謝謝您的通報！`
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

        // 沒有 session，檢查是否有最近提交的報修單（5分鐘內）
        console.log('[報修-圖片] 沒有 session，檢查最近的報修單');
        try {
          const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
          const { data: recentRepairs, error: queryError } = await supabase
            .from('repairs')
            .select('*')
            .eq('user_id', userId)
            .eq('status', 'pending')
            .gte('created_at', fiveMinutesAgo)
            .order('created_at', { ascending: false })
            .limit(1);

          if (queryError) {
            console.error('[報修-圖片] 查詢最近報修失敗:', queryError);
            throw queryError;
          }

          if (recentRepairs && recentRepairs.length > 0) {
            const repair = recentRepairs[0];
            console.log('[報修-圖片] 找到最近的報修單:', repair.repair_code);

            // 將圖片附加到這個報修單
            const imageUrl = `LINE_MESSAGE:${messageId}`;
            const { error: imageError } = await supabase
              .from('repair_images')
              .insert([{
                repair_id: repair.id,
                image_url: imageUrl,
                created_at: new Date().toISOString()
              }]);

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
              text: `✅ 報修已送出\n📌 編號：${repair.repair_code}\n目前狀態：🟡 待處理\n\n📍 地點：${repair.location}\n📝 問題：${repair.description}\n📸 已附上照片\n\n管理單位會盡快處理，謝謝您的通報！`
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
              .select('id, event_type, location, description')
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
                status: 'pending',
                created_at: nowIso,
                updated_at: nowIso
              }])
              .select('id, event_type, location, description, status, created_at')
              .single();

            if (emergencyInsertError || !createdEmergency) {
              throw emergencyInsertError || new Error('寫入失敗');
            }

            // 查詢所有 admin
            const { data: admins, error: adminQueryError } = await supabase
              .from('profiles')
              .select('line_user_id, name')
              .eq('role', 'admin')
              .not('line_user_id', 'is', null);

            if (adminQueryError || !admins || admins.length === 0) {
              throw new Error('找不到管理員');
            }

            const adminTargets = admins.map(a => a.line_user_id).filter(Boolean);

            // 推送審核卡片給所有 admin
            const reviewFlex = {
              type: 'flex',
              altText: '⚠️ 緊急事件待審核',
              contents: {
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
              }
            };

            for (const adminLineId of adminTargets) {
              await client.pushMessage(adminLineId, reviewFlex);
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

        // ===== 處理緊急事件審核（admin） =====
        if ((action === 'approve' || action === 'reject') && emergencyEventId) {
          try {
            // 檢查操作者是否為 admin
            const { data: adminProfile, error: adminProfileErr } = await supabase
              .from('profiles')
              .select('id, name, role')
              .eq('line_user_id', userId)
              .maybeSingle();

            if (adminProfileErr) {
              console.error('[Emergency Review] 查詢 admin 身分失敗:', adminProfileErr);
              await client.replyMessage(replyToken, {
                type: 'text',
                text: '❌ 審核失敗，請稍後再試。'
              });
              continue;
            }

            if (!adminProfile || adminProfile.role !== 'admin') {
              await client.replyMessage(replyToken, {
                type: 'text',
                text: '⛔ 您沒有審核權限。'
              });
              continue;
            }

            // 讀取事件
            const { data: emergencyEvent, error: eventQueryErr } = await supabase
              .from('emergency_reports_line')
              .select('id, event_type, location, description, status')
              .eq('id', emergencyEventId)
              .maybeSingle();

            if (eventQueryErr || !emergencyEvent) {
              console.error('[Emergency Review] 查詢事件失敗:', eventQueryErr);
              await client.replyMessage(replyToken, {
                type: 'text',
                text: '⚠️ 找不到此緊急事件，可能已被處理。'
              });
              continue;
            }

            if (emergencyEvent.status !== 'pending') {
              await client.replyMessage(replyToken, {
                type: 'text',
                text: `ℹ️ 此事件目前狀態為「${emergencyEvent.status}」，無法重複審核。`
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
              await client.replyMessage(replyToken, {
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

              await client.broadcast({ type: 'text', text: broadcastText });
              await client.replyMessage(replyToken, {
                type: 'text',
                text: '✅ 已確認發布，緊急事件通知已廣播給所有住戶。'
              });
              continue;
            }

            // 駁回
            await client.replyMessage(replyToken, {
              type: 'text',
              text: '❌ 已駁回此緊急事件，不會進行廣播。'
            });
            continue;
          } catch (reviewErr) {
            console.error('[Emergency Review] 處理失敗:', reviewErr);
            await client.replyMessage(replyToken, {
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
