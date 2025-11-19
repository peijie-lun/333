// 檢查 supabase_embeddings.json 中的圖片資料
const cache = require('./supabase_embeddings.json');

const imgKeys = Object.keys(cache).filter(k => k.startsWith('img_'));

console.log('=== 圖片資料檢查 ===');
console.log('圖片筆數:', imgKeys.length);

if (imgKeys.length > 0) {
  console.log('\n圖片清單:');
  imgKeys.forEach(key => {
    const img = cache[key];
    console.log(`\n📷 ID: ${key}`);
    console.log(`   內容: ${img.content}`);
    console.log(`   URL: ${img.url || '無'}`);
    console.log(`   類型: ${img.type || '無'}`);
  });
} else {
  console.log('\n❌ 目前快取中沒有圖片資料');
  console.log('💡 需要：');
  console.log('   1. 在 Supabase 執行 supabase_images_table.sql');
  console.log('   2. 新增圖片資料到 images 資料表');
  console.log('   3. 執行 node supabase_fetch.js 更新快取');
}

console.log('\n=== FAQ 資料檢查 ===');
const faqKeys = Object.keys(cache).filter(k => !k.startsWith('img_'));
console.log('FAQ 筆數:', faqKeys.length);
