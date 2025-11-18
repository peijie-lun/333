// 測試圖片資料是否能從 Supabase 抓取
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: __dirname + '/.env' });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testImagesFetch() {
  console.log('🔍 正在測試 Supabase images 資料表...\n');
  
  const { data, error } = await supabase
    .from('images')
    .select('*');
  
  if (error) {
    console.error('❌ 錯誤:', error.message);
    console.log('\n💡 提示：請先在 Supabase 執行 supabase_images_table.sql 建立資料表');
    return;
  }
  
  if (!data || data.length === 0) {
    console.log('⚠️  images 資料表是空的');
    console.log('\n💡 請在 Supabase SQL Editor 執行：');
    console.log(`insert into public.images (url, description) values`);
    console.log(`  ('https://example.com/test.jpg', '測試圖片');`);
    return;
  }
  
  console.log(`✅ 成功抓取 ${data.length} 筆圖片資料：\n`);
  data.forEach((img, idx) => {
    console.log(`📷 圖片 ${idx + 1}:`);
    console.log(`   ID: ${img.id}`);
    console.log(`   URL: ${img.url}`);
    console.log(`   描述: ${img.description || '無'}`);
    console.log(`   建立時間: ${img.created_at}\n`);
  });
}

testImagesFetch();
