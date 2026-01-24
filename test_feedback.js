// 測試回饋系統的簡單腳本
import axios from 'axios';

const BASE_URL = 'http://localhost:3000';

async function testFeedbackSystem() {
  console.log('🧪 開始測試回饋系統...\n');

  try {
    // 1. 測試 LLM API - 發送問題
    console.log('📤 Step 1: 發送測試問題...');
    const llmResponse = await axios.post(`${BASE_URL}/api/llm`, {
      query: '管理費什麼時候要繳？',
      userId: 'test_user_123'
    });

    console.log('✅ 收到回應:', llmResponse.data.answer);
    const chatLogId = llmResponse.data.chatLogId;
    console.log('📝 Chat Log ID:', chatLogId);
    console.log('');

    if (!chatLogId) {
      throw new Error('❌ 沒有收到 chatLogId');
    }

    // 2. 測試「有幫助」回饋
    console.log('📤 Step 2: 測試「有幫助」回饋...');
    const helpfulResponse = await axios.post(`${BASE_URL}/api/feedback`, {
      chatLogId: chatLogId,
      feedbackType: 'helpful',
      userId: 'test_user_123'
    });

    console.log('✅ 回饋結果:', helpfulResponse.data.message);
    console.log('');

    // 3. 測試「不太清楚」回饋（使用另一個問題）
    console.log('📤 Step 3: 發送第二個問題測試「不太清楚」...');
    const llmResponse2 = await axios.post(`${BASE_URL}/api/llm`, {
      query: '包裹怎麼領？',
      userId: 'test_user_123'
    });

    const chatLogId2 = llmResponse2.data.chatLogId;
    console.log('📝 Chat Log ID 2:', chatLogId2);

    const unclearResponse = await axios.post(`${BASE_URL}/api/feedback`, {
      chatLogId: chatLogId2,
      feedbackType: 'unclear',
      userId: 'test_user_123'
    });

    console.log('✅ 回饋結果:', unclearResponse.data.message);
    console.log('🔍 澄清選項:', unclearResponse.data.nextActions);
    console.log('');

    // 4. 測試「沒幫助」回饋（使用另一個問題）
    console.log('📤 Step 4: 發送第三個問題測試「沒幫助」...');
    const llmResponse3 = await axios.post(`${BASE_URL}/api/llm`, {
      query: '怎麼申請停車位？',
      userId: 'test_user_123'
    });

    const chatLogId3 = llmResponse3.data.chatLogId;
    console.log('📝 Chat Log ID 3:', chatLogId3);

    const notHelpfulResponse = await axios.post(`${BASE_URL}/api/feedback`, {
      chatLogId: chatLogId3,
      feedbackType: 'not_helpful',
      userId: 'test_user_123'
    });

    console.log('✅ 回饋結果:', notHelpfulResponse.data.message);
    console.log('');

    console.log('🎉 所有測試完成！');
    console.log('');
    console.log('📊 請到 Supabase 查看以下表格：');
    console.log('   - chat_log: 應該有 3 筆新記錄');
    console.log('   - chat_feedback: 應該有 3 筆回饋記錄');
    console.log('   - intent_stats: 應該更新了統計數據');

  } catch (error) {
    console.error('❌ 測試失敗:', error.response?.data || error.message);
    if (error.response?.data) {
      console.error('   詳細錯誤:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

// 執行測試
testFeedbackSystem();
