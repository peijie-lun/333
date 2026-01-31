// debug_line_test.js - 測試追問機制是否正常
import { chat } from './grokmain.js';

console.log('='.repeat(60));
console.log('測試追問機制');
console.log('='.repeat(60));

async function test() {
  try {
    console.log('\n測試問題：「包裹」\n');
    const result = await chat('包裹');
    
    console.log('\n=== 完整回傳結果 ===');
    console.log(JSON.stringify(result, null, 2));
    
    if (result.needsClarification) {
      console.log('\n✅ 追問機制已觸發！');
      console.log('訊息:', result.clarificationMessage);
      console.log('選項數量:', result.clarificationOptions?.length);
      console.log('選項:');
      result.clarificationOptions?.forEach((opt, i) => {
        console.log(`  ${i + 1}. ${opt.label} → ${opt.value}`);
      });
    } else if (result.answer) {
      console.log('\n⚠️  直接回答（沒有觸發追問）');
      console.log('答案:', result.answer.substring(0, 100));
    } else if (result.error) {
      console.log('\n❌ 發生錯誤:', result.error);
    }
    
    console.log('\n=== 其他資訊 ===');
    console.log('意圖:', result.intent);
    console.log('意圖信心度:', result.intent_confidence);
    console.log('相似度:', result.similarity);
    console.log('已回答:', result.answered);
    
  } catch (error) {
    console.error('\n❌ 測試失敗:', error.message);
    console.error('詳細錯誤:', error);
  }
}

test();
