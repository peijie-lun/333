// reset_and_reload.js
// 完整重設流程:清空資料表、重設序列、重新載入預設資料

const { createClient } = require('@supabase/supabase-js');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: __dirname + '/.env' });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('請在 .env 設定 SUPABASE_URL 和 SUPABASE_ANON_KEY');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function resetAndReload() {
    console.log('🔧 開始完整重設...\n');

    // 預設 FAQ 資料
    const defaultFaqs = [
        '本大樓禁止飼養寵物，違者將依規定處理。',
        '問：可以養寵物嗎？\n答：本大樓禁止飼養寵物，違者將依規定處理。',
        '問：飼養寵物有什麼規定？\n答：本大樓禁止飼養寵物，違者將依規定處理。',
        '問：本大樓是否允許養狗或貓？\n答：本大樓全面禁止飼養任何寵物，包括狗與貓。',
        '問：寵物禁令內容為何？\n答：本大樓規約明定禁止飼養寵物，違者將依規定處理。',
        '問：如果違規飼養寵物會怎樣？\n答：違規者將依社區規約處理，可能面臨罰款或強制改善。',
        '問：垃圾要什麼時候丟？\n答：垃圾請於每日晚上八點至九點間丟置指定地點。',
        '問：停車場可以給訪客停車嗎？\n答：停車場僅供本社區住戶使用，外來車輛請勿停放。'
    ];

    try {
        // 1. 刪除所有資料
        console.log('🗑️  步驟 1: 清空 knowledge 資料表...');
        const { error: deleteError } = await supabase
            .from('knowledge')
            .delete()
            .neq('id', 0);

        if (deleteError) {
            console.error('❌ 刪除失敗:', deleteError);
            console.log('\n⚠️  如果刪除失敗，請手動在 Supabase Dashboard 執行:');
            console.log('   DELETE FROM knowledge;\n');
        } else {
            console.log('✅ 資料已清空\n');
        }

        // 2. 提示重設序列
        console.log('⚠️  步驟 2: 重設 ID 序列');
        console.log('   請在 Supabase Dashboard → SQL Editor 執行以下 SQL:\n');
        console.log('   ALTER SEQUENCE knowledge_id_seq RESTART WITH 1;');
        console.log('   SELECT setval(\'knowledge_id_seq\', 1, false);\n');
        console.log('   或執行檔案: reset_id_sequence.sql\n');
        
        // 等待確認
        console.log('⏳ 請執行上述 SQL 後，按 Enter 繼續...');
        await waitForEnter();

        // 3. 重新插入預設資料
        console.log('\n📝 步驟 3: 插入預設資料...');
        for (let i = 0; i < defaultFaqs.length; i++) {
            const { data, error } = await supabase
                .from('knowledge')
                .insert({ content: defaultFaqs[i] })
                .select();

            if (error) {
                console.error(`❌ 插入第 ${i + 1} 筆失敗:`, error);
            } else {
                console.log(`✅ 已插入: ID=${data[0].id} - ${defaultFaqs[i].substring(0, 30)}...`);
            }
        }

        // 4. 驗證結果
        console.log('\n🔍 步驟 4: 驗證結果...');
        const { data: allData, error: checkError } = await supabase
            .from('knowledge')
            .select('id, content')
            .order('id', { ascending: true });

        if (checkError) {
            console.error('❌ 查詢失敗:', checkError);
        } else {
            console.log(`✅ 目前共有 ${allData.length} 筆資料`);
            if (allData.length > 0) {
                console.log(`   ID 範圍: ${allData[0].id} ~ ${allData[allData.length - 1].id}`);
                
                if (allData[0].id === 1) {
                    console.log('   🎉 ID 已成功從 1 開始!\n');
                } else {
                    console.log(`   ⚠️  警告: ID 從 ${allData[0].id} 開始，不是從 1 開始`);
                    console.log('   請確認已執行 SQL 重設序列指令\n');
                }
            }
        }

        // 5. 清除並更新快取
        console.log('🔄 步驟 5: 更新快取...');
        const cachePath = path.join(__dirname, 'supabase_embeddings.json');
        if (fs.existsSync(cachePath)) {
            fs.unlinkSync(cachePath);
            console.log('✅ 舊快取已清除');
        }

        const result = spawnSync('node', [path.join(__dirname, 'supabase_fetch.js'), '--force'], 
                                 { stdio: 'inherit' });
        
        if (result.error || result.status !== 0) {
            console.error('❌ 快取更新失敗');
        } else {
            console.log('✅ 快取已更新\n');
        }

        console.log('🎉 完成!\n');

    } catch (error) {
        console.error('❌ 發生錯誤:', error);
    }
}

function waitForEnter() {
    return new Promise((resolve) => {
        process.stdin.once('data', () => {
            resolve();
        });
    });
}

// 執行
resetAndReload();
