-- 建立圖片 URL 資料表
create table if not exists public.images (
  id serial primary key,
  url text not null,
  description text,
  created_at timestamp with time zone default now()
);

-- 建立唯一索引避免重複 URL
create unique index if not exists idx_images_url on public.images(url);

-- 插入範例圖片資料（你可以根據需要修改或新增）
insert into public.images (url, description) values
  ('https://example.com/image1.jpg', '社區大門外觀圖'),
  ('https://example.com/image2.jpg', '公共設施示意圖'),
  ('https://example.com/image3.jpg', '停車場配置圖')
on conflict (url) do nothing;
