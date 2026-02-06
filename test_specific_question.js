import { chat } from './grokmain.js';

async function testSpecificQuestion() {
  console.log('測試具體問題：「包裹室開放時間是什麼？」');
  
  const result = await chat('包裹室開放時間是什麼？');
  
  console.log('結果:', JSON.stringify(result, null, 2));
  
  if (result.needsClarification) {
    console.log('❌ 具體問題不應該觸發澄清');
  } else {
    console.log('✅ 具體問題直接回答');
    console.log('答案:', result.answer);
  }
}

testSpecificQuestion().catch(console.error);