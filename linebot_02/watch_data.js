// watch_data.js
// 監控 data 資料夾，檔案有變動時自動執行 build_embeddings.js

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const dataDir = path.join(__dirname, 'data');
let timer = null;

function runBuild() {
  console.log('偵測到 data 資料夾變動，正在執行 build_embeddings.js...');
  const proc = spawn('node', [path.join(__dirname, 'build_embeddings.js')], { stdio: 'inherit' });
}

fs.watch(dataDir, { recursive: false }, (eventType, filename) => {
  if (filename && filename.endsWith('.txt')) {
    // 防止重複觸發
    clearTimeout(timer);
    timer = setTimeout(runBuild, 500);
  }    
});

console.log('正在監控 data 資料夾，檔案有變動會自動執行 build_embeddings.js');