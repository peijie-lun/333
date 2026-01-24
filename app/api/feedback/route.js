import { supabase } from '../../../supabaseClient';

export async function POST(req) {
  try {
    const { chatLogId, feedbackType, userId, clarificationChoice, comment } = await req.json();

    if (!chatLogId || !feedbackType) {
      return new Response(
        JSON.stringify({ error: '缺少必要參數: chatLogId 或 feedbackType' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 驗證 feedbackType
    const validTypes = ['helpful', 'unclear', 'not_helpful'];
    if (!validTypes.includes(feedbackType)) {
      return new Response(
        JSON.stringify({ error: '無效的 feedbackType，必須是: helpful, unclear, not_helpful' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 1. 記錄回饋到 chat_feedback 表
    const { data: feedbackData, error: feedbackError } = await supabase
      .from('chat_feedback')
      .insert([{
        chat_log_id: chatLogId,
        user_id: userId,
        feedback_type: feedbackType,
        clarification_choice: clarificationChoice || null,
        comment: comment || null,
        created_at: new Date().toISOString()
      }])
      .select();

    if (feedbackError) {
      console.error('[Feedback Insert Error]', feedbackError);
      return new Response(
        JSON.stringify({ error: '回饋記錄失敗', details: feedbackError.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 2. 更新 chat_log 的回饋狀態
    const feedbackField = feedbackType === 'helpful' ? 'success_count' :
                         feedbackType === 'unclear' ? 'unclear_count' : 'fail_count';

    const { data: chatLog, error: chatLogError } = await supabase
      .from('chat_log')
      .select('id, feedback, success_count, unclear_count, fail_count')
      .eq('id', chatLogId)
      .single();

    if (chatLogError) {
      console.error('[Chat Log Query Error]', chatLogError);
    }

    // 更新計數器和回饋狀態
    const updateData = {
      feedback: feedbackType,
      [feedbackField]: (chatLog?.[feedbackField] || 0) + 1
    };

    // 如果是 not_helpful，標記 answered = false
    if (feedbackType === 'not_helpful') {
      updateData.answered = false;
    }

    const { error: updateError } = await supabase
      .from('chat_log')
      .update(updateData)
      .eq('id', chatLogId);

    if (updateError) {
      console.error('[Chat Log Update Error]', updateError);
      return new Response(
        JSON.stringify({ error: '更新 chat_log 失敗', details: updateError.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 3. 根據回饋類型返回不同的回應訊息
    let responseMessage = '';
    let nextActions = null;

    switch (feedbackType) {
      case 'helpful':
        responseMessage = '感謝你的回饋！很高興能幫助到你 😊';
        break;

      case 'unclear':
        // 從 chat_log 取得 intent，提供澄清選項
        const intent = chatLog?.intent;
        responseMessage = '好，我懂～你是比較想問下面哪一種呢？';
        nextActions = generateClarificationOptions(intent);
        break;

      case 'not_helpful':
        responseMessage = '了解，這題目前資料可能不完整 🙏\n我會回報給管理單位補齊資料。';
        // 可選：詢問更多資訊
        // responseMessage += '\n\n你方便說一下你想知道的是哪一部分嗎？';
        break;
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: responseMessage,
        nextActions,
        feedbackId: feedbackData?.[0]?.id
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('[Feedback API Error]', err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// 根據 intent 產生澄清選項
function generateClarificationOptions(intent) {
  const clarificationMap = {
    '管費': [
      { label: '管費繳費時間', value: 'fee_time' },
      { label: '管費計算方式', value: 'fee_calculation' },
      { label: '逾期怎麼辦', value: 'fee_overdue' }
    ],
    '包裹': [
      { label: '包裹寄送時間', value: 'package_time' },
      { label: '包裹領取地點', value: 'package_location' },
      { label: '包裹通知方式', value: 'package_notification' }
    ],
    '設施': [
      { label: '設施開放時間', value: 'facility_hours' },
      { label: '設施預約方式', value: 'facility_booking' },
      { label: '設施使用規則', value: 'facility_rules' }
    ],
    '停車': [
      { label: '停車位租用', value: 'parking_rental' },
      { label: '訪客停車', value: 'parking_visitor' },
      { label: '停車費用', value: 'parking_fee' }
    ],
    '維修': [
      { label: '如何報修', value: 'repair_how' },
      { label: '維修時間', value: 'repair_time' },
      { label: '緊急維修', value: 'repair_emergency' }
    ]
  };

  return clarificationMap[intent] || [
    { label: '我想了解更多細節', value: 'more_details' },
    { label: '我想問其他問題', value: 'other_question' }
  ];
}
