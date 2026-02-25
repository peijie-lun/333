-- 方案A：在 repairs 表新增草稿狀態支援
-- 執行此 SQL 來更新 repairs 表結構

-- 1. 修改 status 欄位，允許 'draft' 狀態
ALTER TABLE repairs 
DROP CONSTRAINT IF EXISTS repairs_status_check;

ALTER TABLE repairs 
ADD CONSTRAINT repairs_status_check 
CHECK (status IN ('draft', 'pending', 'processing', 'completed', 'cancelled'));

-- 2. 建立索引加速草稿查詢
CREATE INDEX IF NOT EXISTS idx_repairs_user_status 
ON repairs(user_id, status);

-- 3. 確保每個用戶只能有一筆草稿
CREATE UNIQUE INDEX IF NOT EXISTS idx_repairs_user_draft 
ON repairs(user_id) 
WHERE status = 'draft';

-- 4. 自動清理超過 24 小時的草稿 (可選)
CREATE OR REPLACE FUNCTION cleanup_expired_repair_drafts()
RETURNS void AS $$
BEGIN
  DELETE FROM repairs 
  WHERE status = 'draft' 
  AND updated_at < NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql;

-- 5. 建立定時任務清理過期草稿 (可選，需要 pg_cron 擴充)
-- 如果您的 Supabase 有啟用 pg_cron，可執行以下語句：
-- SELECT cron.schedule('cleanup-repair-drafts', '0 2 * * *', 'SELECT cleanup_expired_repair_drafts()');

COMMENT ON COLUMN repairs.status IS '報修狀態：draft(草稿)、pending(待處理)、processing(處理中)、completed(已完成)、cancelled(已取消)';
