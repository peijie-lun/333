@echo off
chcp 65001 >nul
echo ======================================
echo   測試 Supabase 自動同步
echo ======================================
echo.
echo 步驟 1: 啟動伺服器...
echo.

start "Supabase Auto Sync Server" cmd /k "cd /d "%~dp0" && node app.js"

echo 已在新視窗啟動伺服器
echo.
echo 等待 8 秒讓伺服器完全啟動...
timeout /t 8 /nobreak >nul

echo.
echo 步驟 2: 測試健康檢查...
echo.
curl -s http://localhost:3000/health
echo.
echo.

echo ======================================
echo 步驟 3: 測試即時同步功能
echo ======================================
echo.
echo 請按照以下步驟:
echo.
echo 1. 開啟 Supabase Dashboard
echo    https://app.supabase.com
echo.
echo 2. 進入你的專案 ^-^> Table Editor ^-^> knowledge
echo.
echo 3. 點擊 'Insert' ^-^> 'Insert row'
echo.
echo 4. 在 content 欄位輸入:
echo    問:測試自動同步功能?
echo    答:自動同步正常運作!
echo.
echo 5. 點擊 'Save'
echo.
echo 6. 觀察伺服器視窗,應該會立即出現:
echo    [AutoSync] 快取已更新: id=X
echo.
echo 7. 檢查快取檔案:
echo    supabase_embeddings.json 的修改時間應該更新
echo.
echo ======================================
echo.
echo 是否要開啟 Supabase Dashboard? (Y/N)
set /p OPEN_BROWSER=
if /i "%OPEN_BROWSER%"=="Y" (
    start https://app.supabase.com
    echo 已開啟瀏覽器
)

echo.
echo 伺服器正在背景運行...
echo 測試完成後請關閉伺服器視窗
echo.
pause
