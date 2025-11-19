// app.js
// 完整的自動化方案 - 部署後完全自動運行,無需任何手動操作

require('dotenv').config({ path: __dirname + '/.env' });
const express = require('express');
const { getAutoSync } = require('./supabase_auto_sync');

const app = express();
const PORT = process.env.PORT || 3000;

let autoSync;

// ========== 啟動伺服器 ==========
async function startApp() {
    console.log('🚀 啟動應用程式...\n');

    try {
        // 1. 自動初始化並啟動 Supabase 同步
        console.log('📡 初始化 Supabase 自動同步...');
        autoSync = getAutoSync();
        await autoSync.startAutoSync();
        console.log('✅ Supabase 即時同步已啟動\n');

        // 2. 設定 API 路由
        setupRoutes();

        // 3. 啟動伺服器
        app.listen(PORT, () => {
            console.log(`✅ 伺服器運行於 http://localhost:${PORT}`);
            console.log('📡 Supabase 資料會自動即時同步');
            console.log('💡 無需任何手動操作!\n');
        });

    } catch (error) {
        console.error('❌ 啟動失敗:', error);
        process.exit(1);
    }
}

// ========== API 路由設定 ==========
function setupRoutes() {
    app.use(express.json());

    // 健康檢查
    app.get('/health', (req, res) => {
        res.json({
            status: 'ok',
            syncActive: autoSync?.isWatching || false,
            timestamp: new Date().toISOString()
        });
    });

    // 你的 AI 聊天 API (整合 grokmain.js 的邏輯)
    app.post('/api/chat', async (req, res) => {
        try {
            const { query } = req.body;
            
            // 這裡可以整合你的 grokmain.js 邏輯
            // 快取會自動保持最新,不需要任何手動更新
            
            res.json({
                success: true,
                message: '使用最新快取處理查詢',
                query
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // 手動強制更新 (可選,通常不需要)
    app.post('/api/sync/force', async (req, res) => {
        try {
            await autoSync.forceUpdate();
            res.json({ success: true, message: '手動更新完成' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
}

// ========== 優雅關閉 ==========
async function shutdown(signal) {
    console.log(`\n收到 ${signal} 信號,正在關閉...`);
    
    if (autoSync) {
        await autoSync.stopAutoSync();
        console.log('✅ 同步已停止');
    }
    
    process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ========== 啟動 ==========
startApp();
