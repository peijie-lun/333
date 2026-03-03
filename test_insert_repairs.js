import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// 生成唯一的報修編號
function generateRepairCode(index) {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  const randomNum = (Math.floor(Math.random() * 900) + 100 + index).toString().padStart(3, '0');
  return `R${dateStr}-${randomNum}`;
}

// 測試資料
const testRepairs = [
  // 🚨 緊急報修
  {
    user_id: 'U_test_user_001',
    repair_code: generateRepairCode(1),
    category: '一般報修',
    building: '未指定',
    location: '電梯2號',
    description: '有住戶受困',
    status: 'pending',
    priority: 'urgent',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    user_id: 'U_test_user_002',
    repair_code: generateRepairCode(2),
    category: '一般報修',
    building: '未指定',
    location: '5樓走廊',
    description: '有疑似燒焦味',
    status: 'pending',
    priority: 'urgent',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  
  // ⚠️ 高優先級
  {
    user_id: 'U_test_user_003',
    repair_code: 'R20260303-003',
    category: '一般報修',
    building: '未指定',
    location: '電梯1號',
    description: '按7樓無反應',
    status: 'pending',
    priority: 'high',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    user_id: 'U_test_user_004',
    repair_code: 'R20260303-004',
    category: '一般報修',
    building: '未指定',
    location: '機械車位A區',
    description: '車位升降異常卡住',
    status: 'pending',
    priority: 'high',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    user_id: 'U_test_user_005',
    repair_code: 'R20260303-005',
    category: '一般報修',
    building: '未指定',
    location: '安全梯',
    description: '緊急照明燈不亮',
    status: 'processing',
    priority: 'high',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    user_id: 'U_test_user_006',
    repair_code: 'R20260303-006',
    category: '一般報修',
    building: '未指定',
    location: '地下室B1',
    description: '照明完全不亮',
    status: 'pending',
    priority: 'high',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  
  // 📋 一般優先級
  {
    user_id: 'U_test_user_007',
    repair_code: 'R20260303-007',
    category: '一般報修',
    building: '未指定',
    location: '大廳天花板',
    description: '燈管閃爍且有異音',
    status: 'pending',
    priority: 'medium',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    user_id: 'U_test_user_008',
    repair_code: 'R20260303-008',
    category: '一般報修',
    building: '未指定',
    location: '一樓大門',
    description: '門禁刷卡無反應',
    status: 'pending',
    priority: 'medium',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    user_id: 'U_test_user_009',
    repair_code: 'R20260303-009',
    category: '一般報修',
    building: '未指定',
    location: '管理室旁走道',
    description: '地板積水疑似漏水',
    status: 'processing',
    priority: 'medium',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    user_id: 'U_test_user_010',
    repair_code: 'R20260303-010',
    category: '一般報修',
    building: '未指定',
    location: '地下室B2車道',
    description: '有明顯積水',
    status: 'pending',
    priority: 'medium',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    user_id: 'U_test_user_011',
    repair_code: 'R20260303-011',
    category: '一般報修',
    building: '未指定',
    location: '停車場出口柵欄',
    description: '無法自動升起',
    status: 'pending',
    priority: 'medium',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    user_id: 'U_test_user_012',
    repair_code: 'R20260303-012',
    category: '一般報修',
    building: '未指定',
    location: '車牌辨識系統',
    description: '無法辨識住戶車牌',
    status: 'pending',
    priority: 'medium',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    user_id: 'U_test_user_013',
    repair_code: 'R20260303-013',
    category: '一般報修',
    building: '未指定',
    location: '3樓對講機',
    description: '聲音斷斷續續',
    status: 'pending',
    priority: 'medium',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    user_id: 'U_test_user_014',
    repair_code: 'R20260303-014',
    category: '一般報修',
    building: '未指定',
    location: '停車場監視器3號',
    description: '畫面黑屏',
    status: 'completed',
    priority: 'medium',
    created_at: new Date(Date.now() - 86400000).toISOString(),
    updated_at: new Date().toISOString(),
    completed_at: new Date().toISOString()
  },
  {
    user_id: 'U_test_user_015',
    repair_code: 'R20260303-015',
    category: '一般報修',
    building: '未指定',
    location: '頂樓水塔',
    description: '出現異常噪音',
    status: 'pending',
    priority: 'medium',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    user_id: 'U_test_user_016',
    repair_code: 'R20260303-016',
    category: '一般報修',
    building: '未指定',
    location: '地下室排水孔',
    description: '嚴重堵塞',
    status: 'pending',
    priority: 'medium',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    user_id: 'U_test_user_017',
    repair_code: 'R20260303-017',
    category: '一般報修',
    building: '未指定',
    location: '公共廁所',
    description: '馬桶沖水異常',
    status: 'pending',
    priority: 'medium',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  
  // 🌿 公共設施
  {
    user_id: 'U_test_user_018',
    repair_code: 'R20260303-018',
    category: '一般報修',
    building: '未指定',
    location: '中庭花園',
    description: '灑水器漏水',
    status: 'pending',
    priority: 'low',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    user_id: 'U_test_user_019',
    repair_code: 'R20260303-019',
    category: '一般報修',
    building: '未指定',
    location: '健身房跑步機',
    description: '無法啟動',
    status: 'pending',
    priority: 'low',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    user_id: 'U_test_user_020',
    repair_code: 'R20260303-020',
    category: '一般報修',
    building: '未指定',
    location: '兒童遊戲區',
    description: '溜滑梯螺絲鬆脫',
    status: 'completed',
    priority: 'medium',
    created_at: new Date(Date.now() - 172800000).toISOString(), // 2天前
    updated_at: new Date().toISOString(),
    completed_at: new Date().toISOString()
  }
];

async function insertTestData() {
  console.log('🚀 開始插入測試資料...\n');

  for (const repair of testRepairs) {
    console.log(`📝 插入報修單: ${repair.repair_code} - ${repair.location}`);
    
    const { data, error } = await supabase
      .from('repairs')
      .insert([repair])
      .select();

    if (error) {
      console.error(`❌ 插入失敗 (${repair.repair_code}):`, error.message);
    } else {
      console.log(`✅ 成功插入: ID ${data[0].id}\n`);
    }
  }

  console.log('🎉 測試資料插入完成！');
  console.log('\n📊 查詢測試資料...\n');

  // 驗證插入結果
  const { data: allRepairs, error: queryError } = await supabase
    .from('repairs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);

  if (queryError) {
    console.error('❌ 查詢失敗:', queryError);
  } else {
    console.log(`✅ 目前共有 ${allRepairs.length} 筆報修記錄`);
    allRepairs.forEach(r => {
      console.log(`   ${r.repair_code} | ${r.status} | ${r.location} | ${r.description}`);
    });
  }
}

// 清除測試資料的函數
async function clearTestData() {
  console.log('🧹 清除測試資料...\n');
  
  const { error } = await supabase
    .from('repairs')
    .delete()
    .like('repair_code', 'R20260303-%');

  if (error) {
    console.error('❌ 清除失敗:', error);
  } else {
    console.log('✅ 測試資料已清除');
  }
}

// 執行
const command = process.argv[2];

if (command === 'clear') {
  clearTestData();
} else {
  insertTestData();
}
