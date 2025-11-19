-- reset_id_sequence.sql
-- 在 Supabase Dashboard 的 SQL Editor 中執行此腳本
-- ⚠️ 此腳本會保留資料內容，但重新編號 ID 從 1 開始

-- 方法: 建立臨時表 → 複製資料 → 刪除原表 → 重建 → 還原資料

-- ========== knowledge 資料表 ==========

-- 1. 備份資料到臨時表
CREATE TEMP TABLE knowledge_backup AS 
SELECT content FROM knowledge ORDER BY id;

-- 2. 清空原資料表
DELETE FROM knowledge;

-- 3. 重設序列
ALTER SEQUENCE knowledge_id_seq RESTART WITH 1;
SELECT setval('knowledge_id_seq', 1, false);

-- 4. 從備份還原資料 (ID 會自動從 1 開始)
INSERT INTO knowledge (content)
SELECT content FROM knowledge_backup;

-- 5. 刪除臨時表
DROP TABLE knowledge_backup;

-- ========== images 資料表 ==========

-- 1. 備份 images 資料
CREATE TEMP TABLE images_backup AS 
SELECT url, description FROM images ORDER BY id;

-- 2. 清空原資料表
DELETE FROM images;

-- 3. 重設序列
ALTER SEQUENCE images_id_seq RESTART WITH 1;
SELECT setval('images_id_seq', 1, false);

-- 4. 從備份還原資料
INSERT INTO images (url, description)
SELECT url, description FROM images_backup;

-- 5. 刪除臨時表
DROP TABLE images_backup;

-- 查看結果
SELECT 'knowledge 資料已保留並重新編號' as message;
SELECT COUNT(*) as knowledge_count FROM knowledge;
SELECT MIN(id) as first_id, MAX(id) as last_id FROM knowledge;

SELECT 'images 資料已保留並重新編號' as message;
SELECT COUNT(*) as images_count FROM images;
SELECT MIN(id) as first_id, MAX(id) as last_id FROM images;
