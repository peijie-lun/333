import { chat } from './grokmain.js';

async function testAnnouncement() {
  console.log('測試：「社區最新公告」(6字)');
  
  const result = await chat('社區最新公告');
  
  if (result.needsClarification) {
    console.log('❌ 應該直接回答，不應該澄清');
  } else {
    console.log('✅ 正確：直接回答');
    console.log('答案:', result.answer?.substring(0, 50) + '...');
  }
}

async function testShortQuestion() {
  console.log('\n測試：「包裹」(2字)');
  
  const result = await chat('包裹');
  
  if (result.needsClarification) {
    console.log('✅ 正確：觸發澄清');
    console.log('選項數量:', result.clarificationOptions?.length);
  } else {
    console.log('❌ 應該澄清，不應該直接回答');
  }
}

testAnnouncement()
  .then(testShortQuestion)
  .catch(console.error);