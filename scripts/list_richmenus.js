import { Client } from '@line/bot-sdk';
import 'dotenv/config';

const client = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
});

async function listRichMenus() {
  try {
    console.log('正在查詢所有圖文選單...\n');
    
    const richMenus = await client.getRichMenuList();
    
    if (richMenus.length === 0) {
      console.log('目前沒有任何圖文選單');
      return;
    }

    console.log(`找到 ${richMenus.length} 個圖文選單：\n`);
    
    for (const menu of richMenus) {
      console.log('═══════════════════════════════════════');
      console.log('ID:', menu.richMenuId);
      console.log('名稱:', menu.name);
      console.log('聊天列文字:', menu.chatBarText);
      console.log('大小:', `${menu.size.width}x${menu.size.height}`);
      console.log('區域數量:', menu.areas.length);
      console.log('');
    }

    // 查詢預設圖文選單
    try {
      const defaultRichMenuId = await client.getDefaultRichMenuId();
      console.log('═══════════════════════════════════════');
      console.log('預設圖文選單 ID:', defaultRichMenuId);
    } catch (err) {
      console.log('目前沒有設定預設圖文選單');
    }

    console.log('\n如要刪除圖文選單，請執行：');
    console.log('node scripts/delete_richmenu.js <RICH_MENU_ID>');

  } catch (error) {
    console.error('❌ 查詢失敗:', error);
  }
}

listRichMenus();
