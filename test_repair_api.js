/**
 * 報修功能測試腳本
 * 用於測試報修 API 的基本功能
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// 顏色輸出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(color, ...args) {
  console.log(color, ...args, colors.reset);
}

async function testCreateRepair() {
  log(colors.blue, '\n📝 測試 1: 建立報修單...');
  
  try {
    const response = await fetch(`${BASE_URL}/api/repairs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: 'test_user_' + Date.now(),
        user_name: '測試用戶',
        building: 'A棟',
        location: '3樓走廊',
        description: '天花板漏水',
        priority: 'normal'
      })
    });

    const result = await response.json();
    
    if (result.success && result.data.repair_number) {
      log(colors.green, `✅ 建立成功！報修編號：${result.data.repair_number}`);
      return result.data;
    } else {
      log(colors.red, '❌ 建立失敗:', result);
      return null;
    }
  } catch (error) {
    log(colors.red, '❌ 請求錯誤:', error.message);
    return null;
  }
}

async function testGetRepairs() {
  log(colors.blue, '\n📋 測試 2: 查詢報修單列表...');
  
  try {
    const response = await fetch(`${BASE_URL}/api/repairs?limit=5`);
    const result = await response.json();
    
    if (result.success) {
      log(colors.green, `✅ 查詢成功！共 ${result.data.length} 筆記錄`);
      result.data.forEach((repair, index) => {
        console.log(`  ${index + 1}. ${repair.repair_number} - ${repair.status} - ${repair.location}`);
      });
      return result.data;
    } else {
      log(colors.red, '❌ 查詢失敗:', result);
      return [];
    }
  } catch (error) {
    log(colors.red, '❌ 請求錯誤:', error.message);
    return [];
  }
}

async function testUpdateStatus(repairId) {
  log(colors.blue, '\n🔄 測試 3: 更新報修狀態...');
  
  if (!repairId) {
    log(colors.yellow, '⚠️ 沒有報修單 ID，跳過此測試');
    return false;
  }
  
  try {
    // 更新為處理中
    const response1 = await fetch(`${BASE_URL}/api/repairs`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: repairId,
        status: 'processing',
        notes: '已派員處理'
      })
    });

    const result1 = await response1.json();
    
    if (result1.success) {
      log(colors.green, `✅ 更新為「處理中」成功！`);
    } else {
      log(colors.red, '❌ 更新失敗:', result1);
      return false;
    }

    // 等待 2 秒
    log(colors.yellow, '⏳ 等待 2 秒...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 更新為已完成
    const response2 = await fetch(`${BASE_URL}/api/repairs`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: repairId,
        status: 'completed',
        notes: '問題已解決'
      })
    });

    const result2 = await response2.json();
    
    if (result2.success) {
      log(colors.green, `✅ 更新為「已完成」成功！`);
      return true;
    } else {
      log(colors.red, '❌ 更新失敗:', result2);
      return false;
    }
  } catch (error) {
    log(colors.red, '❌ 請求錯誤:', error.message);
    return false;
  }
}

async function testGetRepairById(repairId) {
  log(colors.blue, '\n🔍 測試 4: 查詢特定報修單...');
  
  if (!repairId) {
    log(colors.yellow, '⚠️ 沒有報修單 ID，跳過此測試');
    return null;
  }
  
  try {
    const response = await fetch(`${BASE_URL}/api/repairs?id=${repairId}`);
    const result = await response.json();
    
    if (result.success) {
      log(colors.green, `✅ 查詢成功！`);
      console.log('  報修編號:', result.data.repair_number);
      console.log('  狀態:', result.data.status);
      console.log('  地點:', result.data.location);
      console.log('  問題:', result.data.description);
      console.log('  建立時間:', new Date(result.data.created_at).toLocaleString('zh-TW'));
      if (result.data.completed_at) {
        console.log('  完成時間:', new Date(result.data.completed_at).toLocaleString('zh-TW'));
      }
      return result.data;
    } else {
      log(colors.red, '❌ 查詢失敗:', result);
      return null;
    }
  } catch (error) {
    log(colors.red, '❌ 請求錯誤:', error.message);
    return null;
  }
}

async function runAllTests() {
  log(colors.yellow, '🚀 開始執行報修功能測試...');
  log(colors.yellow, `📍 API 端點: ${BASE_URL}`);
  
  // 測試 1: 建立報修單
  const newRepair = await testCreateRepair();
  const repairId = newRepair?.id;
  
  // 測試 2: 查詢報修單列表
  await testGetRepairs();
  
  // 測試 3: 更新報修狀態
  await testUpdateStatus(repairId);
  
  // 測試 4: 查詢特定報修單
  await testGetRepairById(repairId);
  
  log(colors.yellow, '\n✨ 測試完成！');
  log(colors.blue, '\n💡 提示：');
  console.log('  - 如果測試成功，表示報修 API 運作正常');
  console.log('  - 如果有推播失敗，請檢查 LINE Bot Token 設定');
  console.log('  - 可以在 Supabase 中查看資料表記錄');
  console.log('  - 訪問 /repairs 頁面查看管理後台');
}

// 執行測試
runAllTests().catch(error => {
  log(colors.red, '❌ 測試執行失敗:', error);
  process.exit(1);
});
