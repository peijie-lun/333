// supabase_auto_sync_v2.js - 即時同步並儲存到 Supabase
const { createClient } = require('@supabase/supabase-js');
const { spawnSync } = require('child_process');
require('dotenv').config({ path: __dirname + '/.env' });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

class SupabaseAutoSync {
	constructor() {
		this.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
		this.isWatching = false;
		this.channels = [];
		this.processingIds = new Set(); // 防止重複處理
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

	// 更新 knowledge embedding
	async updateKnowledgeEmbedding(id, content, hasEmbedding = false) {
		// 防抖: 如果正在處理這個 ID,跳過
		const key = `knowledge-${id}`;
		if (this.processingIds.has(key)) {
			return true;
		}

		// 如果已經有 embedding,跳過更新 (避免無限循環)
		if (hasEmbedding) {
			return true;
		}

		this.processingIds.add(key);
		
		try {
			const embedding = this.getEmbedding(content);
			if (!embedding) {
				console.error(`[Error] ID ${id} embedding 生成失敗`);
				return false;
			}

			const { error } = await this.supabase
				.from('knowledge')
				.update({ embedding })
				.eq('id', id);

			if (error) {
				console.error(`[Error] ID ${id} 更新失敗:`, error);
				return false;
			}

			console.log(`\n[Update] 知識庫已更新!`);
			console.log(`   ID: ${id}`);
			console.log(`   內容: ${content.substring(0, 50)}${content.length > 50 ? '...' : ''}`);
			console.log(`   時間: ${new Date().toLocaleString('zh-TW')}\n`);
			return true;
		} finally {
			// 3 秒後移除鎖定
			setTimeout(() => this.processingIds.delete(key), 3000);
		}
	}

	// 更新 images embedding
	async updateImageEmbedding(id, url, description, hasEmbedding = false) {
		// 防抖: 如果正在處理這個 ID,跳過
		const key = `images-${id}`;
		if (this.processingIds.has(key)) {
			return true;
		}

		// 如果已經有 embedding,跳過更新 (避免無限循環)
		if (hasEmbedding) {
			return true;
		}

		this.processingIds.add(key);
		
		try {
			const imgContent = `圖片: ${description || '無描述'}\nURL: ${url}`;
			const embedding = this.getEmbedding(imgContent);
			
			if (!embedding) {
				console.error(`[Error] 圖片 ID ${id} embedding 生成失敗`);
				return false;
			}

			const { error } = await this.supabase
				.from('images')
				.update({ embedding })
				.eq('id', id);

			if (error) {
				console.error(`[Error] 圖片 ID ${id} 更新失敗:`, error);
				return false;
			}

			console.log(`\n[Update] 圖片已更新!`);
			console.log(`   ID: ${id}`);
			console.log(`   描述: ${description || '無描述'}`);
			console.log(`   URL: ${url}`);
			console.log(`   時間: ${new Date().toLocaleString('zh-TW')}\n`);
			return true;
		} finally {
			// 3 秒後移除鎖定
			setTimeout(() => this.processingIds.delete(key), 3000);
		}
	}

	// 啟動即時監控
	async startAutoSync() {
		if (this.isWatching) {
			console.log('[AutoSync] 監控已在運行中');
			return;
		}

		console.log('[AutoSync] 啟動 Supabase 即時同步...');

		// 監聽 knowledge 資料表
		const knowledgeChannel = this.supabase
			.channel('knowledge-auto-sync')
			.on(
				'postgres_changes',
				{ event: 'INSERT', schema: 'public', table: 'knowledge' },
				async (payload) => {
					await this.updateKnowledgeEmbedding(
						payload.new.id, 
						payload.new.content, 
						!!payload.new.embedding
					);
				}
			)
			.on(
				'postgres_changes',
				{ event: 'UPDATE', schema: 'public', table: 'knowledge' },
				async (payload) => {
					// 檢查是否只是 embedding 被更新 (避免無限循環)
					const contentChanged = payload.old.content !== payload.new.content;
					const onlyEmbeddingChanged = !contentChanged && 
						JSON.stringify(payload.old.embedding) !== JSON.stringify(payload.new.embedding);
					
					if (onlyEmbeddingChanged) {
						// 只有 embedding 變了,不處理 (這是我們自己更新的)
						return;
					}
					
					if (contentChanged) {
						await this.updateKnowledgeEmbedding(
							payload.new.id, 
							payload.new.content, 
							false  // content 變了,強制重新生成
						);
					}
				}
			)
			.on(
				'postgres_changes',
				{ event: 'DELETE', schema: 'public', table: 'knowledge' },
				async (payload) => {
					console.log(`\n[Delete] 知識庫項目已移除! ID: ${payload.old.id}\n`);
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
				{ event: 'INSERT', schema: 'public', table: 'images' },
				async (payload) => {
					await this.updateImageEmbedding(
						payload.new.id,
						payload.new.url,
						payload.new.description,
						!!payload.new.embedding
					);
				}
			)
			.on(
				'postgres_changes',
				{ event: 'UPDATE', schema: 'public', table: 'images' },
				async (payload) => {
					// 檢查是否只是 embedding 被更新 (避免無限循環)
					const contentChanged = payload.old.description !== payload.new.description || 
					                      payload.old.url !== payload.new.url;
					const onlyEmbeddingChanged = !contentChanged && 
						JSON.stringify(payload.old.embedding) !== JSON.stringify(payload.new.embedding);
					
					if (onlyEmbeddingChanged) {
						// 只有 embedding 變了,不處理 (這是我們自己更新的)
						return;
					}
					
					if (contentChanged) {
						await this.updateImageEmbedding(
							payload.new.id,
							payload.new.url,
							payload.new.description,
							false  // 內容變了,強制重新生成
						);
					}
				}
			)
			.on(
				'postgres_changes',
				{ event: 'DELETE', schema: 'public', table: 'images' },
				async (payload) => {
					console.log(`\n[Delete] 圖片已移除! ID: ${payload.old.id}\n`);
				}
			)
			.subscribe((status) => {
				if (status === 'SUBSCRIBED') {
					console.log('[AutoSync] images 監聽已啟動');
				}
			});

		this.channels = [knowledgeChannel, imagesChannel];
		this.isWatching = true;
		console.log('[AutoSync] 自動同步已啟動\n');
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
}

// 單例模式
let syncInstance = null;

function getAutoSync() {
	if (!syncInstance) {
		syncInstance = new SupabaseAutoSync();
	}
	return syncInstance;
}

module.exports = {
	SupabaseAutoSync,
	getAutoSync,
	startAutoSync: async () => {
		const sync = getAutoSync();
		await sync.startAutoSync();
	},
	stopAutoSync: async () => {
		const sync = getAutoSync();
		await sync.stopAutoSync();
	}
};
