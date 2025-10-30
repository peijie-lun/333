# 圖片 URL 功能說明

## 完成的工作

### 1. 建立了圖片 URL 資料表
- 檔案：`supabase_images_table.sql`
- 功能：
  - 建立 `images` 資料表，包含：
    - `id`: 自動編號主鍵
    - `url`: 圖片 URL（不可重複）
    - `description`: 圖片描述
    - `created_at`: 建立時間
  - 已包含範例資料

### 2. 修改了 supabase_fetch.js
- 新增功能：
  - 自動抓取 `images` 資料表的所有圖片
  - 將圖片 URL 和描述轉換成 embedding
  - 圖片資料會加上 `type: 'image'` 和 `url` 欄位，方便辨識
  - 快取 key 使用 `img_` 前綴（例如：`img_1`, `img_2`）

## 使用步驟

### 第一步：在 Supabase 建立資料表
1. 登入你的 Supabase 專案
2. 進入 SQL Editor
3. 複製 `supabase_images_table.sql` 的內容並執行

### 第二步：新增圖片資料
在 Supabase SQL Editor 執行：

```sql
insert into public.images (url, description) values
  ('你的圖片URL', '圖片描述')
on conflict (url) do nothing;
```

### 第三步：執行快取程式
```powershell
node ".\js grok\supabase_fetch.js"
```

程式會：
1. 抓取所有 FAQ 內容
2. 抓取所有圖片 URL
3. 為所有資料產生 embedding
4. 儲存到 `supabase_embeddings.json`

## AI 查詢時的行為

當使用者查詢與圖片相關的內容時：
- AI 會透過 embedding 語意比對找到相關圖片
- 回答中會包含圖片的 URL
- 例如查詢「停車場照片」，AI 可能會回應停車場圖片的 URL

## 快取資料格式範例

```json
{
  "img_1": {
    "content": "圖片: 社區大門外觀圖\nURL: https://example.com/image1.jpg",
    "embedding": [...],
    "type": "image",
    "url": "https://example.com/image1.jpg"
  }
}
```

## 注意事項

- 圖片 URL 必須是有效的網址
- 建議在 description 欄位提供詳細描述，以提升 AI 查詢準確度
- 每次新增圖片後，需要重新執行 `supabase_fetch.js` 更新快取
