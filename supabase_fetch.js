// supabase_fetch_v2.js - 將 embedding 儲存到 Supabase
require('dotenv').config({ path: __dirname + '/.env' });

const { createClient } = require('@supabase/supabase-js');
const { spawnSync } = require('child_process');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 生成 embedding
function getEmbedding(text) {
  const py = spawnSync('python', [__dirname + '/embedding.py', text], { encoding: 'utf-8' });
  if (py.error || py.status !== 0) {
    console.error('[Error] embedding 生成失敗:', py.stderr);
    return null;
  }
  try {
    return JSON.parse(py.stdout);
  } catch {
    console.error('[Error] embedding 解析失敗');
    return null;
  }
}

// 更新所有 knowledge 資料的 embedding
async function updateKnowledgeEmbeddings() {
  console.log('\n[Batch] 開始更新 knowledge embedding...');

  // 1. 抓取所有沒有 embedding 的資料
  const { data: items, error } = await supabase
    .from('knowledge')
    .select('id, content')
    .is('embedding', null);

  if (error) {
    console.error('[Error] 查詢失敗:', error);
    return;
  }

  console.log(`找到 ${items.length} 筆需要更新的資料`);

  // 2. 為每筆資料生成 embedding 並更新
  let successCount = 0;
  let failCount = 0;

  for (const item of items) {
    const embedding = getEmbedding(item.content);
    
    if (embedding) {
      const { error: updateError } = await supabase
        .from('knowledge')
        .update({ embedding })
        .eq('id', item.id);

      if (updateError) {
        console.error(`[Error] ID ${item.id} 更新失敗:`, updateError);
        failCount++;
      } else {
        successCount++;
        console.log(`[Success] ID ${item.id} 更新成功 (${successCount}/${items.length})`);
      }
    } else {
      console.error(`[Error] ID ${item.id} embedding 生成失敗`);
      failCount++;
    }
  }

  console.log(`\n[Batch] knowledge 更新完成: 成功 ${successCount}, 失敗 ${failCount}`);
}

// 更新所有 images 資料的 embedding
async function updateImageEmbeddings() {
  console.log('\n[Batch] 開始更新 images embedding...');

  const { data: items, error } = await supabase
    .from('images')
    .select('id, url, description')
    .is('embedding', null);

  if (error) {
    console.error('[Error] 查詢失敗:', error);
    return;
  }

  console.log(`找到 ${items.length} 筆需要更新的圖片`);

  let successCount = 0;
  let failCount = 0;

  for (const item of items) {
    const imgContent = `圖片: ${item.description || '無描述'}\nURL: ${item.url}`;
    const embedding = getEmbedding(imgContent);
    
    if (embedding) {
      const { error: updateError } = await supabase
        .from('images')
        .update({ embedding })
        .eq('id', item.id);

      if (updateError) {
        console.error(`[Error] ID ${item.id} 更新失敗:`, updateError);
        failCount++;
      } else {
        successCount++;
        console.log(`[Success] ID ${item.id} 更新成功 (${successCount}/${items.length})`);
      }
    } else {
      console.error(`[Error] ID ${item.id} embedding 生成失敗`);
      failCount++;
    }
  }

  console.log(`\n[Batch] images 更新完成: 成功 ${successCount}, 失敗 ${failCount}`);
}

// 主程式
async function main() {
  console.log('[Batch] 開始批次更新 embedding 到 Supabase...\n');
  
  await updateKnowledgeEmbeddings();
  await updateImagesEmbeddings();
  
  console.log('\n[Batch] 所有更新完成!');
}

// 執行
if (require.main === module) {
  main().then(() => process.exit(0)).catch(err => {
    console.error('[Error] 執行失敗:', err);
    process.exit(1);
  });
}

module.exports = { updateKnowledgeEmbeddings, updateImagesEmbeddings };
