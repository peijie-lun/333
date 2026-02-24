import { Client } from '@line/bot-sdk';
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const client = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
});

async function createRichMenu() {
  try {
    // 建立圖文選單
    const richMenu = {
      size: {
        width: 2500,
        height: 1686
      },
      selected: true,
      name: '社區服務選單',
      chatBarText: '社區服務',
      areas: [
        {
          bounds: {
            x: 0,
            y: 0,
            width: 833,
            height: 843
          },
          action: {
            type: 'message',
            text: '報修'
          }
        },
        {
          bounds: {
            x: 834,
            y: 0,
            width: 833,
            height: 843
          },
          action: {
            type: 'message',
            text: '我的報修'
          }
        },
        {
          bounds: {
            x: 1667,
            y: 0,
            width: 833,
            height: 843
          },
          action: {
            type: 'message',
            text: '熱門問題'
          }
        },
        {
          bounds: {
            x: 0,
            y: 843,
            width: 833,
            height: 843
          },
          action: {
            type: 'message',
            text: '公共設施'
          }
        },
        {
          bounds: {
            x: 834,
            y: 843,
            width: 833,
            height: 843
          },
          action: {
            type: 'uri',
            uri: 'https://liff.line.me/2006697074-p2Vz3qMY' // 請替換成你的 LIFF URL
          }
        },
        {
          bounds: {
            x: 1667,
            y: 843,
            width: 833,
            height: 843
          },
          action: {
            type: 'message',
            text: '聯絡管委會'
          }
        }
      ]
    };

    console.log('正在建立圖文選單...');
    const richMenuId = await client.createRichMenu(richMenu);
    console.log('✅ 圖文選單建立成功！');
    console.log('Rich Menu ID:', richMenuId);

    // 這裡需要上傳圖片，請先準備一張 2500x1686 的圖片
    // 圖片應該分成 3x2 的格子，對應上面的 6 個區域
    const imagePath = path.join(__dirname, 'richmenu_image.png');
    
    if (fs.existsSync(imagePath)) {
      console.log('\n正在上傳圖文選單圖片...');
      const imageBuffer = fs.readFileSync(imagePath);
      await client.setRichMenuImage(richMenuId, imageBuffer, 'image/png');
      console.log('✅ 圖片上傳成功！');
    } else {
      console.log('\n⚠️ 找不到圖片檔案:', imagePath);
      console.log('請準備一張 2500x1686 的圖片，並命名為 richmenu_image.png');
      console.log('圖片應該分成 3x2 的格子：');
      console.log('┌─────────┬─────────┬─────────┐');
      console.log('│  報修   │ 我的報修 │ 熱門問題 │');
      console.log('├─────────┼─────────┼─────────┤');
      console.log('│ 公共設施 │  訪客  │ 聯絡管委會│');
      console.log('└─────────┴─────────┴─────────┘');
    }

    // 設定為預設選單（所有用戶）
    console.log('\n正在設定為預設圖文選單...');
    await client.setDefaultRichMenu(richMenuId);
    console.log('✅ 已設定為預設圖文選單！');

    console.log('\n🎉 圖文選單建立完成！');
    console.log('Rich Menu ID:', richMenuId);
    console.log('\n如果要刪除舊的圖文選單，請執行：');
    console.log('node scripts/list_richmenus.js');

  } catch (error) {
    console.error('❌ 建立圖文選單失敗:', error);
    if (error.response) {
      console.error('錯誤詳情:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

createRichMenu();
