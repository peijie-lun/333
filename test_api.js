// test_api.js - 測試 API 呼叫
const axios = require('axios');

const API_URL = 'http://localhost:3000/api/chat';

async function testChat(message) {
  console.log(`\n[Test] 問題: ${message}`);
  console.log('[Test] 正在呼叫 API...\n');

  try {
    const response = await axios.post(API_URL, {
      message: message
    });

    console.log('[Success] API 回應:');
    console.log('─────────────────────────────');
    console.log(response.data.answer);
    console.log('─────────────────────────────');

    if (response.data.images && response.data.images.length > 0) {
      console.log(`\n[Images] 找到 ${response.data.images.length} 張相關圖片:`);
      response.data.images.forEach((url, idx) => {
        console.log(`  ${idx + 1}. ${url}`);
      });
    }

    if (response.data.sources && response.data.sources.length > 0) {
      console.log(`\n[Sources] 參考來源 (前 3 筆):`);
      response.data.sources.forEach((src, idx) => {
        console.log(`  ${idx + 1}. ID ${src.id} (相似度: ${(src.similarity * 100).toFixed(2)}%)`);
      });
    }

  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.error('[Error] 無法連線到伺服器!');
      console.error('[Error] 請先執行: node app.js');
    } else if (error.response) {
      console.error('[Error] API 錯誤:', error.response.data);
    } else {
      console.error('[Error] 請求失敗:', error.message);
    }
  }
}

// main
async function main() {
  const question = process.argv[2] || '可不可以養寵物?';
  
  console.log('═══════════════════════════════════════');
  console.log('   AI 聊天 API 測試工具');
  console.log('═══════════════════════════════════════');

  await testChat(question);

  console.log('\n═══════════════════════════════════════\n');
}

// 執行
if (require.main === module) {
  main().then(() => process.exit(0));
}

module.exports = { testChat };
