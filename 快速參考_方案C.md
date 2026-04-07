# 緊急事件回報 - 快速參考

## 🎯 系統架構

```
住戶發起
   ↓
[快速選項 + 自由輸入] ← 事件類型選擇
   ↓
輸入地點
   ↓
輸入描述
   ↓
確認卡片 [✅ 提交] [❌ 取消]
   ↓
寫入 emergency_reports_line (status='pending')
   ↓
推送審核卡片給所有 Admin
   ↓
Admin [✅ 發布] [❌ 駁回]
   ↓
廣播 / 不廣播


```

---

## 📊 數據表

### emergency_sessions (追蹤會話進度)

| 欄位 | 類型 | 用途 |
|------|------|------|
| id | UUID | 主鍵 |
| line_user_id | TEXT | 使用者識別 |
| event_type | TEXT | 保存的事件類型 |
| location | TEXT | 保存的地點 |
| description | TEXT | 暫存描述 |
| status | TEXT | `event_type` \| `location` \| `description` \| `confirm` \| `submitted` |
| created_at | TIMESTAMPTZ | 創建時間 |
| updated_at | TIMESTAMPTZ | 最後更新時間 |

**關鍵索引**：
- `UNIQUE (line_user_id) WHERE status != 'submitted'` ← 同一使用者只有一個活躍會話

---

### emergency_reports_line (最終提交的報告)

| 欄位 | 類型 | 用途 |
|------|------|------|
| id | UUID | 主鍵 |
| reporter_line_user_id | TEXT | 回報者 LINE ID |
| reporter_profile_id | UUID | 回報者檔案 (FK) |
| event_type | TEXT | 事件類型 |
| location | TEXT | 發生地點 |
| description | TEXT | 事件描述 |
| status | TEXT | `pending` \| `approved` \| `rejected` |
| reviewed_by | UUID | 審核者檔案 (FK) |
| reviewed_at | TIMESTAMPTZ | 審核時間 |
| created_at | TIMESTAMPTZ | 建立時間 |
| updated_at | TIMESTAMPTZ | 更新時間 |

---

## 🔄 狀態機 (State Machine)

```
┌──────────────┐
│  event_type  │ ← 使用者選擇或輸入事件類型
└──────┬───────┘
       ↓
┌──────────────┐
│   location   │ ← 使用者輸入地點
└──────┬───────┘
       ↓
┌──────────────┐
│ description  │ ← 使用者輸入描述 → 推送確認卡片
└──────┬───────┘
       ↓
    [選擇]
   ↙     ↘
取消      提交
 ↓        ↓
END   emergency_
      reports_line
      (status='pending')
         ↓
      [Admin 審核]
     ↙         ↘
approved      rejected
   ↓            ↓
廣播           結束
```

---

## 📤 Postback Actions

| Action | 觸發點 | 後端處理 |
|--------|--------|---------|
| `select_event_type&type=火災` | 快速選擇按鈕 | 更新 event_type → 進入 location 狀態 |
| `show_other_types` | 「其他」按鈕 | 推送二級卡片 |
| `submit_emergency&session_id=xxx&description=xxx` | 「確認提交」 | 寫入 emergency_reports_line + 推送 Admin 卡片 |
| `cancel_emergency&session_id=xxx` | 「取消」 | 標記會話為已提交（不進行廣播） |
| `approve&event_id=xxx` | Admin「發布」 | 廣播給所有住戶 |
| `reject&event_id=xxx` | Admin「駁回」 | 不廣播 |

---

## 🎨 Flex Message 示例

### 1️⃣ 事件類型選擇卡片

```json
{
  "type": "flex",
  "contents": {
    "type": "bubble",
    "body": {
      "type": "box",
      "layout": "vertical",
      "contents": [
        {
          "type": "text",
          "text": "🚨 請選擇事件類型",
          "weight": "bold",
          "size": "lg"
        }
      ]
    },
    "footer": {
      "type": "box",
      "layout": "vertical",
      "contents": [
        {"type": "button", "label": "🔥 火災", "action": {"type": "postback", "data": "action=select_event_type&type=火災"}},
        {"type": "button", "label": "💧 水災", "action": {"type": "postback", "data": "action=select_event_type&type=水災"}},
        ...
      ]
    }
  }
}
```

### 2️⃣ 確認卡片

```json
{
  "type": "flex",
  "contents": {
    "type": "bubble",
    "body": {
      "type": "box",
      "contents": [
        {"type": "text", "text": "📋 確認事件資訊", "weight": "bold"},
        {"type": "text", "text": "🔹 類型：火災"},
        {"type": "text", "text": "🔹 地點：A棟3樓"},
        {"type": "text", "text": "🔹 描述：走廊有煙味"}
      ]
    },
    "footer": {
      "type": "box",
      "contents": [
        {"type": "button", "style": "primary", "color": "#22C55E", "label": "✅ 確認提交", "action": {"type": "postback", "data": "action=submit_emergency&session_id=xxx&description=..."}},
        {"type": "button", "label": "❌ 取消", "action": {"type": "postback", "data": "action=cancel_emergency&session_id=xxx"}}
      ]
    }
  }
}
```

---

## 🐛 Debug 技巧

### 檢查會話是否創建

```sql
SELECT * FROM emergency_sessions 
WHERE line_user_id = 'U...' 
ORDER BY updated_at DESC 
LIMIT 1;
```

### 檢查報告是否寫入

```sql
SELECT * FROM emergency_reports_line 
WHERE reporter_line_user_id = 'U...' 
ORDER BY created_at DESC 
LIMIT 1;
```

### 檢查 Admin 是否存在

```sql
SELECT line_user_id, name, role FROM profiles 
WHERE role = 'admin' 
AND line_user_id IS NOT NULL;
```

### 查看 Webhook 日誌

```bash
# Vercel
vercel logs <project-name> --follow

# 或檢查 console 輸出中的 [DEBUG Postback] 或 [Emergency Review]
```

---

## ⚡ 快速流程

### 使用者視角

```
1️⃣ 輸入「緊急事件」
2️⃣ 點擊「🔥 火災」或輸入自訂類型
3️⃣ 輸入「A棟3樓」
4️⃣ 輸入「走廊有煙味」
5️⃣ 點擊「✅ 確認提交」
→ 完成！等待 Admin 審核
```

### Admin 視角

```
1️⃣ 收到 Flex 卡片「⚠️ 緊急事件待審核」
2️⃣ 檢查內容
3️⃣ 點擊「✅ 確認發布」或「❌ 駁回」
→ 完成！如果發布，所有住戶收到廣播
```

---

## 💾 SQL 快速部署

```sql
-- 1. 創建會話表
CREATE TABLE IF NOT EXISTS public.emergency_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  line_user_id text NOT NULL,
  event_type text,
  location text,
  description text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT emergency_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT emergency_sessions_status_check CHECK (status = ANY (array['event_type'::text, 'location'::text, 'description'::text, 'confirm'::text, 'submitted'::text]))
);

-- 2. 創建索引
CREATE UNIQUE INDEX IF NOT EXISTS idx_emergency_sessions_line_user_id_active 
  ON public.emergency_sessions(line_user_id) 
  WHERE status != 'submitted';

CREATE INDEX IF NOT EXISTS idx_emergency_sessions_updated_at 
  ON public.emergency_sessions(updated_at DESC);
```

---

## 🔐 權限檢查

- 住戶：可以發起回報（無需特殊權限）
- Admin (`role='admin'`)：可以審核和發布廣播
- 其他角色：無法進行審核（會顯示「⛔ 您沒有審核權限」）

---

## 📌 重要提醒

⚠️ **提交前清單**：
- [ ] SQL 文件已執行
- [ ] 代碼已推送
- [ ] Webhook 已測試
- [ ] 圖文選單按鈕已設置為傳送「緊急事件」文字
- [ ] 至少有一個 Admin 帳號且 `line_user_id` 已綁定

