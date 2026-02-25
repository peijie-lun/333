-- ===================================
-- 報修系統資料表結構
-- ===================================

-- 1. 報修單主表 (repair_requests)
CREATE TABLE IF NOT EXISTS repair_requests (
  id SERIAL PRIMARY KEY,
  repair_number VARCHAR(20) UNIQUE NOT NULL, -- 報修編號 R20260224-001
  user_id VARCHAR(255) NOT NULL, -- LINE User ID
  user_name VARCHAR(255), -- 使用者名稱
  building VARCHAR(10), -- 棟別：A棟、B棟、C棟
  location TEXT NOT NULL, -- 地點
  description TEXT NOT NULL, -- 問題描述
  photo_url TEXT, -- 照片 URL 或 LINE Message ID
  status VARCHAR(20) DEFAULT 'pending', -- 狀態：pending(待處理)、processing(處理中)、completed(已完成)、cancelled(已取消)
  priority VARCHAR(20) DEFAULT 'normal', -- 優先級：low, normal, high, urgent
  assigned_to VARCHAR(255), -- 指派給誰（管理員）
  notes TEXT, -- 管理員備註
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE -- 完成時間
);

-- 建立索引以加速查詢
CREATE INDEX IF NOT EXISTS idx_repair_user_id ON repair_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_repair_status ON repair_requests(status);
CREATE INDEX IF NOT EXISTS idx_repair_created_at ON repair_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_repair_number ON repair_requests(repair_number);

-- 2. 報修流程 Session 表 (repair_sessions)
CREATE TABLE IF NOT EXISTS repair_sessions (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) UNIQUE NOT NULL, -- LINE User ID
  step VARCHAR(20) NOT NULL, -- 目前步驟：building, location, description, photo
  building VARCHAR(10), -- 棟別（暫存）
  location TEXT, -- 地點（暫存）
  description TEXT, -- 問題描述（暫存）
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. 報修單狀態變更記錄表 (repair_status_history)
CREATE TABLE IF NOT EXISTS repair_status_history (
  id SERIAL PRIMARY KEY,
  repair_id INTEGER NOT NULL REFERENCES repair_requests(id) ON DELETE CASCADE,
  old_status VARCHAR(20),
  new_status VARCHAR(20) NOT NULL,
  changed_by VARCHAR(255), -- 誰改的（管理員）
  notes TEXT, -- 變更備註
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_repair_history_repair_id ON repair_status_history(repair_id);

-- 4. 報修編號計數器 (用於生成每日流水號)
CREATE TABLE IF NOT EXISTS repair_number_counter (
  date DATE PRIMARY KEY,
  counter INTEGER DEFAULT 0
);

-- ===================================
-- 觸發器：自動更新 updated_at
-- ===================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_repair_requests_updated_at ON repair_requests;
CREATE TRIGGER update_repair_requests_updated_at
  BEFORE UPDATE ON repair_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_repair_sessions_updated_at ON repair_sessions;
CREATE TRIGGER update_repair_sessions_updated_at
  BEFORE UPDATE ON repair_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ===================================
-- 函數：生成報修編號
-- ===================================
CREATE OR REPLACE FUNCTION generate_repair_number()
RETURNS TEXT AS $$
DECLARE
  today DATE := CURRENT_DATE;
  counter_value INTEGER;
  repair_number TEXT;
BEGIN
  -- 取得或建立今天的計數器
  INSERT INTO repair_number_counter (date, counter)
  VALUES (today, 1)
  ON CONFLICT (date)
  DO UPDATE SET counter = repair_number_counter.counter + 1
  RETURNING counter INTO counter_value;
  
  -- 生成報修編號 格式：R20260224-001
  repair_number := 'R' || TO_CHAR(today, 'YYYYMMDD') || '-' || LPAD(counter_value::TEXT, 3, '0');
  
  RETURN repair_number;
END;
$$ LANGUAGE plpgsql;

-- ===================================
-- 觸發器：自動生成報修編號
-- ===================================
CREATE OR REPLACE FUNCTION auto_generate_repair_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.repair_number IS NULL OR NEW.repair_number = '' THEN
    NEW.repair_number := generate_repair_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_generate_repair_number ON repair_requests;
CREATE TRIGGER trigger_generate_repair_number
  BEFORE INSERT ON repair_requests
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_repair_number();

-- ===================================
-- 觸發器：記錄狀態變更歷史
-- ===================================
CREATE OR REPLACE FUNCTION log_repair_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO repair_status_history (repair_id, old_status, new_status, notes)
    VALUES (NEW.id, OLD.status, NEW.status, '狀態變更');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_log_repair_status_change ON repair_requests;
CREATE TRIGGER trigger_log_repair_status_change
  AFTER UPDATE ON repair_requests
  FOR EACH ROW
  EXECUTE FUNCTION log_repair_status_change();

-- ===================================
-- RLS (Row Level Security) 設定
-- ===================================
ALTER TABLE repair_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE repair_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE repair_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE repair_number_counter ENABLE ROW LEVEL SECURITY;

-- 允許所有操作（開發階段，正式環境需要更嚴格的權限控制）
DROP POLICY IF EXISTS "Allow all operations for repair_requests" ON repair_requests;
CREATE POLICY "Allow all operations for repair_requests" ON repair_requests FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow all operations for repair_sessions" ON repair_sessions;
CREATE POLICY "Allow all operations for repair_sessions" ON repair_sessions FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow all operations for repair_status_history" ON repair_status_history;
CREATE POLICY "Allow all operations for repair_status_history" ON repair_status_history FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow all operations for repair_number_counter" ON repair_number_counter;
CREATE POLICY "Allow all operations for repair_number_counter" ON repair_number_counter FOR ALL USING (true);

-- ===================================
-- 測試資料（可選）
-- ===================================
-- INSERT INTO repair_requests (user_id, user_name, repair_type, location, description, status)
-- VALUES 
--   ('test_user_001', '王小明', '水電', '3樓電梯旁', '水龍頭漏水', 'pending'),
--   ('test_user_002', '李小華', '電梯', '1樓電梯', '電梯按鈕故障', 'processing');
