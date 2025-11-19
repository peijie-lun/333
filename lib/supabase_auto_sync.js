// supabase_auto_sync.js
// 整合到網站的自動同步模組 - 背景自動運行,無需手動操作

const { createClient } = require('@supabase/supabase-js');
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: __dirname + '/.env' });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

class SupabaseAutoSync {
	constructor() {
		this.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
		this.cachePath = path.join(__dirname, 'supabase_embeddings.json');
		this.isWatching = false;
		this.channels = [];
	}

	getEmbedding(text) {
		const py = spawnSync('python', [__dirname + '/embedding.py', text], { encoding: 'utf-8' });
		if (py.error || py.status !== 0) return null;
		try {
			return JSON.parse(py.stdout);
		} catch {
			return null;
		}
	}

	loadCache() {
		if (fs.existsSync(this.cachePath)) {
			try {
				return JSON.parse(fs.readFileSync(this.cachePath, 'utf-8'));
			} catch {
				return {};
			}
		}
		return {};
	}

	saveCache(cache) {
		fs.writeFileSync(this.cachePath, JSON.stringify(cache, null, 2), 'utf-8');
	}

	// 更新單筆資料的快取
	async updateCacheEntry(id, content) {
		const cache = this.loadCache();
		const embedding = this.getEmbedding(content);
		if (embedding) {
			cache[String(id)] = { content, embedding };
			this.saveCache(cache);
			console.log(`[AutoSync] 快取已更新: id=${id}`);
			return true;
		}
		return false;
	}

	// 刪除快取項目
	deleteCacheEntry(id) {
		const cache = this.loadCache();
		delete cache[String(id)];
		this.saveCache(cache);
		console.log(`[AutoSync] 快取已刪除: id=${id}`);
	}

	// 更新圖片快取
	async updateImageCache(id, url, description) {
		const cache = this.loadCache();
		const imgKey = `img_${id}`;
		const imgContent = `圖片: ${description || '無描述'}\nURL: ${url}`;
		const embedding = this.getEmbedding(imgContent);
		if (embedding) {
			cache[imgKey] = { content: imgContent, embedding, type: 'image', url };
			this.saveCache(cache);
			console.log(`[AutoSync] 圖片快取已更新: img_${id}`);
			return true;
		}
		return false;
	}

	// 刪除圖片快取
	deleteImageCache(id) {
		const cache = this.loadCache();
		delete cache[`img_${id}`];
		this.saveCache(cache);
		console.log(`[AutoSync] 圖片快取已刪除: img_${id}`);
	}

	// 初始化 - 確保快取存在
	async initialize() {
		if (!fs.existsSync(this.cachePath)) {
			console.log('[AutoSync] 初始化快取...');
			const fetchPath = path.join(__dirname, 'supabase_fetch.js');
			const result = spawnSync('node', [fetchPath, '--force'], { stdio: 'inherit' });
			if (result.error || result.status !== 0) {
				console.error('[AutoSync] 初始化失敗');
				return false;
			}
		}
		return true;
	}

	// 啟動即時監控
	async startAutoSync() {
		if (this.isWatching) {
			console.log('[AutoSync] 監控已在運行中');
			return;
		}

		// 初始化
		await this.initialize();

		// 監聽 knowledge 資料表
		const knowledgeChannel = this.supabase
			.channel('knowledge-auto-sync')
			.on(
				'postgres_changes',
				{ event: '*', schema: 'public', table: 'knowledge' },
				async (payload) => {
					switch (payload.eventType) {
						case 'INSERT':
						case 'UPDATE':
							await this.updateCacheEntry(payload.new.id, payload.new.content);
							break;
						case 'DELETE':
							this.deleteCacheEntry(payload.old.id);
							break;
					}
				}
			)
			.subscribe((status) => {
				if (status === 'SUBSCRIBED') {
					console.log('[AutoSync] knowledge 監聽已啟動');
				}
			});

		// 監聽 images 資料表
		const imagesChannel = this.supabase
			.channel('images-auto-sync')
			.on(
				'postgres_changes',
				{ event: '*', schema: 'public', table: 'images' },
				async (payload) => {
					switch (payload.eventType) {
						case 'INSERT':
						case 'UPDATE':
							await this.updateImageCache(payload.new.id, payload.new.url, payload.new.description);
							break;
						case 'DELETE':
							this.deleteImageCache(payload.old.id);
							break;
					}
				}
			)
			.subscribe((status) => {
				if (status === 'SUBSCRIBED') {
					console.log('[AutoSync] images 監聽已啟動');
				}
			});

		this.channels = [knowledgeChannel, imagesChannel];
		this.isWatching = true;
		console.log('[AutoSync] 自動同步已啟動');
	}

	// 停止監控
	async stopAutoSync() {
		for (const channel of this.channels) {
			await this.supabase.removeChannel(channel);
		}
		this.channels = [];
		this.isWatching = false;
		console.log('[AutoSync] 自動同步已停止');
	}

	// 手動強制更新所有快取
	async forceUpdate() {
		console.log('[AutoSync] 強制更新所有快取...');
		const fetchPath = path.join(__dirname, 'supabase_fetch.js');
		const result = spawnSync('node', [fetchPath, '--force'], { stdio: 'inherit' });
		return result.error || result.status === 0;
	}
}

// 單例模式 - 整個應用程式共用同一個實例
let syncInstance = null;

function getAutoSync() {
	if (!syncInstance) {
		syncInstance = new SupabaseAutoSync();
	}
	return syncInstance;
}

// 導出
module.exports = {
	SupabaseAutoSync,
	getAutoSync,
	// 便捷方法
	startAutoSync: async () => {
		const sync = getAutoSync();
		await sync.startAutoSync();
	},
	stopAutoSync: async () => {
		const sync = getAutoSync();
		await sync.stopAutoSync();
	},
	forceUpdate: async () => {
		const sync = getAutoSync();
		await sync.forceUpdate();
	}
};
