// clear_cache.js
// 清除快取並強制重新從 Supabase 載入資料

const fs = require('fs');
const path = require('path');
const cachePath = path.join(__dirname, 'supabase_embeddings.json');

if (fs.existsSync(cachePath)) {
    fs.unlinkSync(cachePath);
    console.log('✅ 快取已清除:', cachePath);
    console.log('💡 執行 node supabase_fetch.js 來重新產生快取');
} else {
    console.log('ℹ️ 快取檔案不存在,無需清除');
}
