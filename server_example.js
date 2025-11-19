// server.js
// 網站伺服器範例 - 整合自動同步功能

const express = require('express');
const { getAutoSync } = require('./supabase_auto_sync');
require('dotenv').config({ path: __dirname + '/.env' });

const app = express();
const PORT = process.env.PORT || 3000;

// 啟動時自動開啟同步
let autoSync;

async function startServer() {
	// 初始化並啟動自動同步
	autoSync = getAutoSync();
	await autoSync.startAutoSync();
	console.log('✅ Supabase 自動同步已啟動');

	// 你的 API 路由
	app.get('/api/chat', async (req, res) => {
		const query = req.query.q;
		// 這裡整合你的 grokmain.js 邏輯
		// 快取會自動保持最新
		res.json({ message: '使用最新快取處理查詢', query });
	});

	// 手動觸發更新的路由 (可選)
	app.post('/api/sync/force', async (req, res) => {
		await autoSync.forceUpdate();
		res.json({ success: true, message: '強制更新完成' });
	});

	// 健康檢查
	app.get('/health', (req, res) => {
		res.json({
			status: 'ok',
			syncActive: autoSync.isWatching,
			timestamp: new Date().toISOString()
		});
	});

	// 啟動伺服器
	app.listen(PORT, () => {
		console.log(`🚀 伺服器運行於 http://localhost:${PORT}`);
		console.log('📡 Supabase 資料會自動同步,無需手動操作');
	});
}

// 優雅關閉
process.on('SIGINT', async () => {
	console.log('\n正在關閉伺服器...');
	if (autoSync) {
		await autoSync.stopAutoSync();
	}
	process.exit(0);
});

process.on('SIGTERM', async () => {
	if (autoSync) {
		await autoSync.stopAutoSync();
	}
	process.exit(0);
});

// 啟動
startServer().catch(err => {
	console.error('❌ 啟動失敗:', err);
	process.exit(1);
});
