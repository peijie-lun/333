// app.js - 使用 Supabase pgvector 版本
const express = require('express');
const { chat } = require('./grokmain');
const { startAutoSync, stopAutoSync } = require('./supabase_auto_sync');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS 設定 - 允許前端連接
app.use((req, res, next) => {
	res.header('Access-Control-Allow-Origin', '*'); // 允許所有來源
	res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
	res.header('Access-Control-Allow-Headers', 'Content-Type');
	
	// 處理 preflight request
	if (req.method === 'OPTIONS') {
		return res.sendStatus(200);
	}
	
	next();
});

app.use(express.json());

// 健康檢查
app.get('/health', (req, res) => {
	res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// AI 聊天 API
app.post('/api/chat', async (req, res) => {
	const { message } = req.body;
	
	if (!message) {
		return res.status(400).json({ error: '缺少 message 參數' });
	}

	try {
		const result = await chat(message);
		res.json(result);
	} catch (error) {
		console.error('Chat error:', error);
		res.status(500).json({ error: '處理失敗' });
	}
});

// 啟動伺服器
async function startApp() {
	console.log('[App] 啟動應用程式...\n');

	// 啟動自動同步
	console.log('[App] 初始化 Supabase 自動同步...');
	await startAutoSync();

	// 啟動 HTTP 伺服器
	app.listen(PORT, () => {
		console.log(`\n[App] 伺服器運行於 http://localhost:${PORT}`);
		console.log('[App] Supabase 資料會自動即時同步');
		console.log('[App] 所有 embedding 儲存在雲端資料庫\n');
	});
}

// 優雅關閉
process.on('SIGINT', async () => {
	console.log('\n[App] 正在關閉伺服器...');
	await stopAutoSync();
	process.exit(0);
});

process.on('SIGTERM', async () => {
	console.log('\n[App] 正在關閉伺服器...');
	await stopAutoSync();
	process.exit(0);
});

// 啟動
startApp().catch((err) => {
	console.error('[Error] 啟動失敗:', err);
	process.exit(1);
});
