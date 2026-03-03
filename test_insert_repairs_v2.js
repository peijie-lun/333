import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// 生成唯一的報修編號
function generateRepairCode() {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  const randomNum = Math.floor(Math.random() * 900 + 100).toString();
  const timestamp = Date.now().toString().slice(-3);
  return `R${dateStr}-${randomNum}${timestamp}`;
}

// 測試資料模板
const testRepairsData = [
  // 🚨 緊急報修
  { location: '電梯2號', description: '有住戶受困', priority: 'urgent', status: 'pending' },
  { location: '5樓走廊', description: '有疑似燒焦味', priority: 'urgent', status: 'pending' },
  
  // ⚠️ 高優先級
  { location: '電梯1號', description: '按7樓無反應', priority: 'high', status: 'pending' },
  { location: '機械車位A區', description: '車位升降異常卡住', priority: 'high', status: 'pending' },
  { location: '安全梯', description: '緊急照明燈不亮', priority: 'high', status: 'processing' },
  { location: '地下室B1', description: '照明完全不亮', priority: 'high', status: 'pending' },
  
  // 📋 一般優先級
  { location: '大廳天花板', description: '燈管閃爍且有異音', priority: 'medium', status: 'pending' },
  { location: '一樓大門', description: '門禁刷卡無反應', priority: 'medium', status: 'pending' },
  { location: '管理室旁走道', description: '地板積水疑似漏水', priority: 'medium', status: 'processing' },
  { location: '地下室B2車道', description: '有明顯積水', priority: 'medium', status: 'pending' },
  { location: '停車場出口柵欄', description: '無法自動升起', priority: 'medium', status: 'pending' },
  { location: '車牌辨識系統', description: '無法辨識住戶車牌', priority: 'medium', status: 'pending' },
  { location: '3樓對講機', description: '聲音斷斷續續', priority: 'medium', status: 'pending' },
  { location: '停車場監視器3號', description: '畫面黑屏', priority: 'medium', status: 'completed', completed: true },
  { location: '頂樓水塔', description: '出現異常噪音', priority: 'medium', status: 'pending' },
  { location: '地下室排水孔', description: '嚴重堵塞', priority: 'medium', status: 'pending' },
  { location: '公共廁所', description: '馬桶沖水異常', priority: 'medium', status: 'pending' },
  
  // 🌿 公共設施
  { location: '中庭花園', description: '灑水器漏水', priority: 'low', status: 'pending' },
  { location: '健身房跑步機', description: '無法啟動', priority: 'low', status: 'pending' },
  { location: '兒童遊戲區', description: '溜滑梯螺絲鬆脫', priority: 'medium', status: 'completed', completed: true }
];

async function insertTestData() {
  console.log('🚀 開始插入測試資料...\n');
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < testRepairsData.length; i++) {
    const template = testRepairsData[i];
    const repair = {
      user_id: `U_test_user_${String(i + 1).padStart(3, '0')}`,
      repair_code: generateRepairCode(),
      category: '一般報修',
      building: '未指定',
      location: template.location,
      description: template.description,
      status: template.status,
      priority: template.priority,
      created_at: template.completed 
        ? new Date(Date.now() - 86400000 * (i % 3 + 1)).toISOString() 
        : new Date().toISOString(),
      updated_at: new Date().toISOString(),
      completed_at: template.completed ? new Date().toISOString() : null
    };

    // 確保 location 和 description 不是 null
    if (!repair.location) repair.location = '未指定';
    if (!repair.description) repair.description = '待補充';

    console.log(`📝 [${i + 1}/${testRepairsData.length}] ${repair.repair_code} - ${repair.location}`);
    
    const { data, error } = await supabase
      .from('repairs')
      .insert([repair])
      .select();

    if (error) {
      console.error(`   ❌ 失敗: ${error.message}`);
      failCount++;
    } else {
      console.log(`   ✅ 成功 (ID: ${data[0].id})`);
      successCount++;
    }
    
    // 延遲一點避免編號重複
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`🎉 插入完成！`);
  console.log(`✅ 成功: ${successCount} 筆`);
  console.log(`❌ 失敗: ${failCount} 筆`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  // 驗證插入結果
  console.log('📊 查詢測試資料...\n');
  const { data: allRepairs, error: queryError } = await supabase
    .from('repairs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(25);

  if (queryError) {
    console.error('❌ 查詢失敗:', queryError);
  } else {
    console.log(`✅ 目前共有 ${allRepairs.length} 筆報修記錄\n`);
    
    // 按狀態統計
    const stats = {
      pending: 0,
      processing: 0,
      completed: 0,
      cancelled: 0
    };
    
    allRepairs.forEach(r => {
      if (stats[r.status] !== undefined) stats[r.status]++;
    });
    
    console.log('📈 狀態統計：');
    console.log(`   🟡 待處理: ${stats.pending} 筆`);
    console.log(`   🔵 處理中: ${stats.processing} 筆`);
    console.log(`   ✅ 已完成: ${stats.completed} 筆`);
    console.log(`   ❌ 已取消: ${stats.cancelled} 筆`);
  }
}

// 清除測試資料的函數
async function clearTestData() {
  console.log('🧹 清除測試資料...\n');
  
  const { data, error } = await supabase
    .from('repairs')
    .delete()
    .or('user_id.like.U_test_%,repair_code.like.R20260303-%')
    .select();

  if (error) {
    console.error('❌ 清除失敗:', error);
  } else {
    console.log(`✅ 已清除 ${data?.length || 0} 筆測試資料`);
  }
}

// 執行
const command = process.argv[2];

if (command === 'clear') {
  clearTestData();
} else {
  insertTestData();
}
