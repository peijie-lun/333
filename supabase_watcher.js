// supabase_watcher.js
// 即時監控 Supabase 資料變更,自動更新快取

const { createClient } = require('@supabase/supabase-js');
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: __dirname + '/.env' });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
	throw new Error('請在 .env 設定 SUPABASE_URL 和 SUPABASE_ANON_KEY');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const cachePath = path.join(__dirname, 'supabase_embeddings.json');

function getEmbedding(text) {
	const py = spawnSync('python', [__dirname + '/embedding.py', text], { encoding: 'utf-8' });
	if (py.error || py.status !== 0) return null;
	try {
		return JSON.parse(py.stdout);
	} catch {
		return null;
	}
}

function loadCache() {
	if (fs.existsSync(cachePath)) {
		try {
			return JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
		} catch {
			return {};
		}
	}
	return {};
}

function saveCache(cache) {
	fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf-8');
}

// 更新單筆資料的快取
async function updateCacheEntry(id, content) {
	console.log(`🔄 更新快取: id=${id}`);
	const cache = loadCache();
	const embedding = getEmbedding(content);
	if (embedding) {
		cache[String(id)] = { content, embedding };
		saveCache(cache);
		console.log(`✅ 快取已更新: id=${id}`);
		return true;
	} else {
		console.error(`❌ embedding 失敗: id=${id}`);
		return false;
	}
}

// 刪除快取項目
function deleteCacheEntry(id) {
	console.log(`🗑️ 刪除快取: id=${id}`);
	const cache = loadCache();
	delete cache[String(id)];
	saveCache(cache);
	console.log(`✅ 快取已刪除: id=${id}`);
}

// 更新圖片快取
async function updateImageCache(id, url, description) {
	console.log(`🖼️ 更新圖片快取: img_${id}`);
	const cache = loadCache();
	const imgKey = `img_${id}`;
	const imgContent = `圖片: ${description || '無描述'}\nURL: ${url}`;
	const embedding = getEmbedding(imgContent);
	if (embedding) {
		cache[imgKey] = { content: imgContent, embedding, type: 'image', url };
		saveCache(cache);
		console.log(`✅ 圖片快取已更新: img_${id}`);
		return true;
	} else {
		console.error(`❌ 圖片 embedding 失敗: img_${id}`);
		return false;
	}
}

// 刪除圖片快取
function deleteImageCache(id) {
	console.log(`🗑️ 刪除圖片快取: img_${id}`);
	const cache = loadCache();
	delete cache[`img_${id}`];
	saveCache(cache);
	console.log(`✅ 圖片快取已刪除: img_${id}`);
}

// 初始載入所有資料
async function initialLoad() {
	console.log('📥 開始初始載入...');
	const fetchPath = path.join(__dirname, 'supabase_fetch.js');
	const result = spawnSync('node', [fetchPath, '--force'], { stdio: 'inherit' });
	if (result.error || result.status !== 0) {
		console.error('❌ 初始載入失敗');
		return false;
	}
	console.log('✅ 初始載入完成');
	return true;
}

// 啟動監聽器
async function startWatcher() {
	console.log('👀 啟動 Supabase 即時監控...\n');
	
	// 初始載入
	await initialLoad();
	
	// 監聽 knowledge 資料表
	const knowledgeChannel = supabase
		.channel('knowledge-changes')
		.on(
			'postgres_changes',
			{ event: '*', schema: 'public', table: 'knowledge' },
			async (payload) => {
				console.log('\n📢 知識庫資料變更:', payload.eventType);
				
				switch (payload.eventType) {
					case 'INSERT':
						await updateCacheEntry(payload.new.id, payload.new.content);
						break;
					case 'UPDATE':
						await updateCacheEntry(payload.new.id, payload.new.content);
						break;
					case 'DELETE':
						deleteCacheEntry(payload.old.id);
						break;
				}
			}
		)
		.subscribe((status) => {
			if (status === 'SUBSCRIBED') {
				console.log('✅ knowledge 資料表監聽已啟動');
			}
		});
	
	// 監聽 images 資料表
	const imagesChannel = supabase
		.channel('images-changes')
		.on(
			'postgres_changes',
			{ event: '*', schema: 'public', table: 'images' },
			async (payload) => {
				console.log('\n📢 圖片資料變更:', payload.eventType);
				
				switch (payload.eventType) {
					case 'INSERT':
						await updateImageCache(payload.new.id, payload.new.url, payload.new.description);
						break;
					case 'UPDATE':
						await updateImageCache(payload.new.id, payload.new.url, payload.new.description);
						break;
					case 'DELETE':
						deleteImageCache(payload.old.id);
						break;
				}
			}
		)
		.subscribe((status) => {
			if (status === 'SUBSCRIBED') {
				console.log('✅ images 資料表監聽已啟動');
			}
		});
	
	console.log('\n🎯 監控系統已啟動!等待 Supabase 資料變更...');
	console.log('💡 按 Ctrl+C 停止監控\n');
}

// 優雅關閉
process.on('SIGINT', () => {
	console.log('\n\n👋 停止監控...');
	process.exit(0);
});

// 啟動
startWatcher().catch(err => {
	console.error('❌ 啟動失敗:', err);
	process.exit(1);
});
