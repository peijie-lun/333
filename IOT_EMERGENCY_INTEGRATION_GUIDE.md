# IoT 緊急事件通知系統 - 完整整合指南

## 🎯 系統概述

這個系統實現了自動推播住户緊急事件給其緊急聯繫人的功能。當住户通過 IoT 設備（如緊急按鈕）觸發緊急事件時，LINE Bot 會自動推送通知給預設的緊急聯繫人。

```
IoT 設備 (緊急按鈕)
    ↓
iot_action_logs 表 (event_type='emergency')
    ↓
Database Webhook (自動觸發)
    ↓
/api/iot-emergency-webhook 端點
    ↓
notifyEmergencyContact() 函數
    ↓
LINE Bot → 推送消息給聯繫人
```

---

## 📋 實現清單

### ✅ 已完成的工作

1. **SQL 擴展** (`extend_profiles_for_emergency_contact.sql`)
   - 添加 `emergency_contact_line_user_id` 欄位到 profiles 表
   - 建立索引以提升查詢性能

2. **Webhook 端點** (`app/api/iot-emergency-webhook/route.js`)
   - 接收 Supabase Database Webhook 觸發
   - 自動查詢緊急聯繫人信息
   - 通過 LINE Bot 發送推播消息

3. **輔助函數** (在 `app/api/line/route.js` 中)
   - `notifyEmergencyContact(operatorProfileId, eventContext)`
   - 可在其他地方調用以發送緊急通知

---

## 🚀 部署步驟

### 步驟 1: 執行 SQL 遷移

```sql
-- 運行 extend_profiles_for_emergency_contact.sql
-- 在 Supabase SQL 編輯器中執行，或在你的 migration 工具中執行
```

**驗證：**
```sql
-- 確認欄位已添加
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'profiles' 
AND column_name = 'emergency_contact_line_user_id';
```

### 步驟 2: 部署 Webhook 端點

確保 `/api/iot-emergency-webhook` 已部署到你的伺服器。

**測試端點可用性：**
```bash
curl -X POST https://your-domain.com/api/iot-emergency-webhook \
  -H "Content-Type: application/json" \
  -d '{"type":"INSERT","table":"iot_action_logs","record":{"id":"test","cmd":"E","event_type":"emergency","operator_profile_id":"your-test-id"}}'
```

### 步驟 3: 在 Supabase 中配置 Webhook

1. 進入 Supabase → **Database** → **Webhooks**
2. 點擊 **Create a new webhook**
3. 配置如下：

| 項目 | 值 |
|------|-----|
| 名稱 | IoT Emergency Event Notification |
| 事件: Table | iot_action_logs |
| 事件: Trigger | INSERT |
| HTTP Method | POST |
| URL | https://your-domain.com/api/iot-emergency-webhook |

---

## 🧪 測試流程

### 測試 1: 驗證傳播流（推薦）

#### 準備：
1. 使用測試用戶 A（住户）
2. 使用測試用戶 B（聯繫人）

#### 操作步驟：

**1. 更新住户的緊急聯繫人信息**
```javascript
// 在 Supabase 或使用您的管理界面
const { error } = await supabase
  .from('profiles')
  .update({
    emergency_contact_name: '測試聯繫人',
    emergency_contact_phone: '0912345678',
    emergency_contact_line_user_id: 'U1234567890abcdef'  // 聯繫人的 LINE ID
  })
  .eq('id', 'operator-profile-id');
```

**2. 手動觸發 IoT 緊急事件**
```sql
-- 在 Supabase SQL 編輯器中執行
INSERT INTO iot_action_logs (cmd, event_type, source, operator_profile_id)
VALUES 
  ('E', 'emergency', 'wifi', 'operator-profile-id');
```

**3. 驗證結果**
- 檢查 Supabase 日誌中的 Webhook 觸發記錄
- 檢查應用伺服器的日誌輸出
- 確認聯繫人收到 LINE 推播消息

### 測試 2: 直接調用 notifyEmergencyContact() 函數

在你的 route.js 中測試：
```javascript
// 在某個處理器中調用
const result = await notifyEmergencyContact('operator-profile-id', 'IoT 緊急按鈕');
console.log('通知結果:', result);
```

### 測試 3: 通過 curl 觸發 Webhook

```bash
curl -X POST http://localhost:3000/api/iot-emergency-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "type": "INSERT",
    "table": "iot_action_logs",
    "record": {
      "id": "uuid-123",
      "cmd": "E",
      "event_type": "emergency",
      "source": "wifi",
      "operator_profile_id": "住户-uuid",
      "created_at": "2026-04-07T10:00:00Z",
      "message": null,
      "device_payload": {}
    },
    "schema": "public",
    "old_record": null
  }'
```

期望響應：
```json
{
  "success": true,
  "message": "Emergency notification sent successfully",
  "iotLogId": "uuid-123",
  "emergencyContactName": "測試聯繫人"
}
```

---

## 📊 監控與日誌

### 查看 Webhook 觸發歷史

```sql
-- 查詢最近的緊急事件
SELECT 
  id, 
  cmd, 
  event_type, 
  operator_profile_id, 
  created_at,
  message
FROM iot_action_logs
WHERE event_type = 'emergency'
ORDER BY created_at DESC
LIMIT 10;
```

### 伺服器日誌

查看以下日誌標記：
- `🚨 [IoT 緊急事件]` - Webhook 端點
- `🚨 [緊急通知]` - 推播函數

---

## 🔧 故障排查

### 問題 1: Webhook 未觸發

**症狀：** 插入 iot_action_logs 記錄但沒有看到 Webhook 日誌

**檢查清單：**
- [ ] Supabase Webhook 已啟用
- [ ] Webhook URL 正確且可公開訪問
- [ ] 防火牆允許 Webhook IP 範圍
- [ ] 伺服器正在運行且無錯誤

**解決方案：**
```bash
# 1. 測試 URL 可達性
curl -I https://your-domain.com/api/iot-emergency-webhook

# 2. 檢查伺服器日誌
tail -f /var/log/your-app.log | grep "IoT 緊急事件"
```

### 問題 2: LINE 消息未推送

**症狀：** Webhook 成功執行但聯繫人未收到消息

**檢查清單：**
- [ ] `emergency_contact_line_user_id` 已正確設定
- [ ] LINE_CHANNEL_ACCESS_TOKEN 環境變數正確
- [ ] LINE Bot 推送訊息額度充足
- [ ] 緯度線 ID 格式正確（應以 U 開頭）

**測試 ACCESS TOKEN：**
```bash
curl -X GET https://api.line.biz/v3/bot/profile \
  -H "Authorization: Bearer YOUR_CHANNEL_ACCESS_TOKEN"
```

### 問題 3: 查詢超時

**症狀：** Webhook 返回 500 或超時

**可能原因：**
- Supabase 查詢緩慢
- 資料庫連接池已滿

**優化方案：**
```javascript
// 添加查詢超時
const { data, error } = await supabase
  .from('profiles')
  .select('...')
  .eq('id', operatorProfileId)
  .maybeSingle()
  .abortSignal(AbortSignal.timeout(5000)); // 5秒超時
```

---

## 📱 LINE 消息格式自定義

修改 webhook 中的消息內容：

```javascript
const emergencyMessage = {
  type: 'text',
  text: `🚨 【緊急事件通知】\n\n` +
        `事件類型：${eventContext}\n` +
        `住户姓名：${operatorProfile.name}\n` +
        // 添加更多信息...
};

// 或使用 Flex Template 獲得更好的格式
const flexTemplate = {
  type: 'flex',
  altText: '緊急事件通知',
  contents: {
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'text', text: '🚨 緊急事件', weight: 'bold', size: 'xl' },
        // ...
      ]
    }
  }
};
```

---

## 🔐 安全建議

1. **驗證 Webhook 來源**
   ```javascript
   // 添加 Supabase 簽名驗證
   ```

2. **隱藏敏感信息**
   - 不要在消息中暴露完整的聯繫方式
   - 使用加密存儲敏感欄位

3. **限制 API 訪問**
   - 設定 Supabase RLS 政策
   - 確保只有授權的應用程式能觸發推播

---

## 📞 後續功能擴展

可考慮的增強功能：

1. **多個聯繫人支持**
   - 創建 emergency_contacts 表
   - 支持每個住户多個聯繫人

2. **事件確認機制**
   - 聯繫人收到消息後需點擊確認
   - 追蹤事件處理流程

3. **自動升級通知**
   - 如果聯繫人未回應，升級到其他成員
   - 設定重試時間間隔

4. **事件記錄與分析**
   - 記錄所有緊急事件歷史
   - 生成緊急事件報告

---

## 📞 支持與聯繫

如有問題，請檢查：
1. Supabase 控制面板的 Webhook 日誌
2. 應用伺服器的錯誤日誌
3. LINE 官方文件的最新 API 要求
