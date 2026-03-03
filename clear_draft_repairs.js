import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function clearDrafts() {
  console.log('🧹 清除所有草稿報修單...\n');
  
  // 先查詢有多少草稿
  const { data: drafts, error: queryError } = await supabase
    .from('repairs')
    .select('*')
    .eq('status', 'draft');

  if (queryError) {
    console.error('❌ 查詢失敗:', queryError);
    return;
  }

  if (!drafts || drafts.length === 0) {
    console.log('✅ 沒有草稿需要清除');
    return;
  }

  console.log(`📋 找到 ${drafts.length} 筆草稿：`);
  drafts.forEach(d => {
    console.log(`   - ID: ${d.id}, 用戶: ${d.user_id}, 地點: ${d.location || '未填寫'}, 描述: ${d.description || '未填寫'}`);
  });

  console.log('\n🗑️ 刪除中...');

  const { error: deleteError } = await supabase
    .from('repairs')
    .delete()
    .eq('status', 'draft');

  if (deleteError) {
    console.error('❌ 刪除失敗:', deleteError);
  } else {
    console.log(`✅ 已清除 ${drafts.length} 筆草稿報修單`);
  }
}

clearDrafts();
