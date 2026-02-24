import { Client } from '@line/bot-sdk';
import 'dotenv/config';

const client = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
});

const richMenuId = process.argv[2];

if (!richMenuId) {
  console.error('❌ 請提供 Rich Menu ID');
  console.log('使用方式: node scripts/delete_richmenu.js <RICH_MENU_ID>');
  process.exit(1);
}

async function deleteRichMenu() {
  try {
    console.log('正在刪除圖文選單:', richMenuId);
    await client.deleteRichMenu(richMenuId);
    console.log('✅ 圖文選單已刪除');
  } catch (error) {
    console.error('❌ 刪除失敗:', error.message);
  }
}

deleteRichMenu();
