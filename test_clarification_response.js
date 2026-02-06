import { chat } from './grokmain.js';

async function testClarification() {
  console.log('=== 測試澄清選項處理 ===');
  
  console.log('\n1. 測試管理費澄清選項:');
  const result = await chat('clarify:fee_amount');
  console.log('答案:', result.answer?.substring(0, 100) + '...');
  console.log('是否已回答:', result.answered);
  
  console.log('\n2. 測試包裹澄清選項:');
  const result2 = await chat('clarify:package_pickup');
  console.log('答案:', result2.answer?.substring(0, 100) + '...');
  console.log('是否已回答:', result2.answered);
}

testClarification().catch(console.error);