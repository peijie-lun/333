 // 測試查詢
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function test() {
  // 1. 檢查有多少資料有 embedding
  const { data, error } = await supabase
    .from('knowledge')
    .select('id, content, embedding')
    .not('embedding', 'is', null)
    .limit(3);

  if (error) {
    console.error('查詢失敗:', error);
    return;
  }

  console.log(`找到 ${data.length} 筆有 embedding 的資料:`);
  data.forEach(item => {
    console.log(`\nID ${item.id}:`);
    console.log(`內容: ${item.content.substring(0, 50)}...`);
    console.log(`Embedding: ${item.embedding ? '[OK] 有向量' : '[NO] 無向量'}`);
  });

  // 2. 測試搜尋函數
  console.log('\n\n測試搜尋函數...');
  const testVector = Array(384).fill(0.1); // 測試向量
  const { data: searchData, error: searchError } = await supabase.rpc('search_knowledge', {
    query_embedding: testVector,
    match_threshold: 0.0,
    match_count: 5
  });

  if (searchError) {
    console.error('搜尋失敗:', searchError);
  } else {
    console.log(`搜尋結果: ${searchData.length} 筆`);
    searchData.forEach((item, idx) => {
      console.log(`\n#${idx + 1} ID ${item.id} 相似度: ${(item.similarity * 100).toFixed(2)}%`);
      console.log(`內容: ${item.content.substring(0, 80)}...`);
    });
  }
}

test().then(() => process.exit(0));
