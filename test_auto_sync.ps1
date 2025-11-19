# 測試自動同步功能

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  🧪 Supabase 自動同步測試" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# 步驟 1: 啟動伺服器
Write-Host "步驟 1: 啟動伺服器..." -ForegroundColor Yellow
Write-Host "請在新開的視窗確認看到:" -ForegroundColor Gray
Write-Host "  ✅ Supabase 即時同步已啟動" -ForegroundColor Gray
Write-Host "  ✅ 伺服器運行於 http://localhost:3000" -ForegroundColor Gray
Write-Host ""

$serverProcess = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot'; Write-Host '🚀 啟動測試伺服器...' -ForegroundColor Green; node app.js" -PassThru
Write-Host "✅ 伺服器已在新視窗啟動 (PID: $($serverProcess.Id))" -ForegroundColor Green
Write-Host ""

# 等待啟動
Write-Host "等待伺服器啟動..." -ForegroundColor Yellow
Start-Sleep -Seconds 8

# 步驟 2: 測試健康檢查
Write-Host "步驟 2: 測試健康檢查..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "http://localhost:3000/health" -Method Get
    Write-Host "✅ 健康檢查成功!" -ForegroundColor Green
    Write-Host "   狀態: $($health.status)" -ForegroundColor Gray
    Write-Host "   同步啟用: $($health.syncActive)" -ForegroundColor Gray
    Write-Host "   時間: $($health.timestamp)" -ForegroundColor Gray
    Write-Host ""
} catch {
    Write-Host "❌ 健康檢查失敗: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "   請確認伺服器視窗是否有錯誤訊息" -ForegroundColor Yellow
    Write-Host ""
}

# 步驟 3: 測試說明
Write-Host "步驟 3: 測試即時同步功能" -ForegroundColor Yellow
Write-Host ""
Write-Host "📋 請按照以下步驟測試:" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. 開啟 Supabase Dashboard" -ForegroundColor White
Write-Host "   https://app.supabase.com" -ForegroundColor Gray
Write-Host ""
Write-Host "2. 進入你的專案 → Table Editor → knowledge" -ForegroundColor White
Write-Host ""
Write-Host "3. 點擊 'Insert' → 'Insert row'" -ForegroundColor White
Write-Host ""
Write-Host "4. 在 content 欄位輸入:" -ForegroundColor White
Write-Host "   問:測試自動同步功能?" -ForegroundColor Green
Write-Host "   答:自動同步正常運作!" -ForegroundColor Green
Write-Host ""
Write-Host "5. 點擊 'Save'" -ForegroundColor White
Write-Host ""
Write-Host "6. 觀察伺服器視窗,應該會立即出現:" -ForegroundColor White
Write-Host "   [AutoSync] 快取已更新: id=X" -ForegroundColor Green
Write-Host ""
Write-Host "7. 檢查快取檔案已更新:" -ForegroundColor White
Write-Host "   查看 supabase_embeddings.json 的最後修改時間" -ForegroundColor Gray
Write-Host ""

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "💡 提示:" -ForegroundColor Yellow
Write-Host "  - 伺服器會持續運行在背景" -ForegroundColor Gray
Write-Host "  - 任何 Supabase 資料變更都會即時同步" -ForegroundColor Gray
Write-Host "  - 按 Ctrl+C 可停止測試" -ForegroundColor Gray
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# 互動選項
Write-Host "按任意鍵繼續..." -ForegroundColor Yellow
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

# 開啟 Supabase
Write-Host ""
Write-Host "是否要開啟 Supabase Dashboard? (Y/N)" -ForegroundColor Yellow
$openBrowser = Read-Host
if ($openBrowser -eq 'Y' -or $openBrowser -eq 'y') {
    Start-Process "https://app.supabase.com"
    Write-Host "✅ 已開啟瀏覽器" -ForegroundColor Green
}

Write-Host ""
Write-Host "測試完成後,要關閉伺服器嗎? (Y/N)" -ForegroundColor Yellow
$closeServer = Read-Host
if ($closeServer -eq 'Y' -or $closeServer -eq 'y') {
    Stop-Process -Id $serverProcess.Id -Force
    Write-Host "✅ 伺服器已關閉" -ForegroundColor Green
} else {
    Write-Host "ℹ️  伺服器仍在運行,請手動關閉視窗" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "測試結束!" -ForegroundColor Green
