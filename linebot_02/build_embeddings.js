// build_embeddings.js
// 快取 data 資料夾所有 txt 檔案的 embedding 到 embeddings.json

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const dataDir = path.join(__dirname, 'data');
const cachePath = path.join(__dirname, 'embeddings.json');

function getEmbedding(text) {
  const py = spawnSync('python', [__dirname + '/embedding.py', text], { encoding: 'utf-8' });
  if (py.error || py.status !== 0) return null;
  try {
    return JSON.parse(py.stdout);
  } catch {
    return null;
  }
}

function getFileMtime(filePath) {
  return fs.statSync(filePath).mtimeMs;
}

// 讀取快取
let cache = {};
if (fs.existsSync(cachePath)) {
  try {
    cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
  } catch {}
}

const files = fs.readdirSync(dataDir).filter(f => f.toLowerCase().endsWith('.txt'));
let updated = false;
let successFiles = [];
let failFiles = [];
for (const file of files) {
  const filePath = path.join(dataDir, file);
  const mtime = getFileMtime(filePath);
  if (!cache[file] || cache[file].mtime !== mtime) {
    try {
      const text = fs.readFileSync(filePath, 'utf-8');
      const embedding = getEmbedding(text);
      if (embedding) {
        cache[file] = { text, embedding, mtime };
        updated = true;
        successFiles.push(file);
        console.log(`已更新 embedding: ${file}`);
      } else {
        failFiles.push(file);
        console.error(`embedding 失敗: ${file}`);
      }
    } catch (err) {
      failFiles.push(file);
      console.error(`讀取或 embedding 失敗: ${file}`, err);
    }
  } else {
    // 沒有變動就不重算
    successFiles.push(file);
  }
}
// 刪除快取中已移除的檔案
for (const file in cache) {
  if (!files.includes(file)) {
    delete cache[file];
    updated = true;
    console.log(`已移除 embedding: ${file}`);
  }
}
if (updated) {
  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf-8');
  console.log('embeddings.json 已更新');
}
console.log('快取成功檔案：', successFiles);
if (failFiles.length > 0) {
  console.log('快取失敗檔案：', failFiles);
}
