// view_latest_data.js
// 查看最新的資料

const fs = require('fs');
const path = require('path');

const cachePath = path.join(__dirname, 'supabase_embeddings.json');
const cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));

// 取得所有非圖片的 ID 並排序
const ids = Object.keys(cache)
    .filter(k => !k.startsWith('img_'))
    .map(Number)
    .sort((a, b) => a - b);

// 取最新的 N 筆
const count = process.argv[2] || 2;  // 預設顯示最新 2 筆
const latestIds = ids.slice(-count);

console.log(`\n📋 最新的 ${latestIds.length} 筆資料:\n`);

latestIds.forEach(id => {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`ID: ${id}`);
    console.log(`內容: ${cache[id].content}`);
    console.log('');
});

console.log(`總共有 ${ids.length} 筆資料\n`);
