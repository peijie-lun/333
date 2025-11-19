// renumber_ids_keep_data.js
// 重新編號 ID 從 1 開始，但保留所有現有資料

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
require('dotenv').config({ path: __dirname + '/.env' });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('請在 .env 設定 SUPABASE_URL 和 SUPABASE_ANON_KEY');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function renumberIds() {
    console.log('🔢 開始重新編號 ID (保留所有資料)...\n');

    try {
        // ===== 處理 knowledge 資料表 =====
        console.log('📥 讀取 knowledge 資料...');
        const { data: knowledgeData, error: readError } = await supabase
            .from('knowledge')
            .select('id, content')
            .order('id', { ascending: true });

        if (readError) {
            console.error('❌ 讀取失敗:', readError);
            return;
        }

        if (!knowledgeData || knowledgeData.length === 0) {
            console.log('ℹ️  knowledge 資料表是空的\n');
        } else {
            console.log(`✅ 讀取到 ${knowledgeData.length} 筆資料`);
            console.log(`   目前 ID 範圍: ${knowledgeData[0].id} ~ ${knowledgeData[knowledgeData.length - 1].id}\n`);

            // 備份資料內容 (不含 ID)
            const backupData = knowledgeData.map(row => row.content);

            console.log('💾 已備份資料內容');
            console.log('🗑️  刪除舊資料...');

            // 刪除所有資料
            const { error: deleteError } = await supabase
                .from('knowledge')
                .delete()
                .neq('id', 0);

            if (deleteError) {
                console.error('❌ 刪除失敗:', deleteError);
                console.log('⚠️  資料已備份在記憶體中，請手動在 Supabase 執行:');
                console.log('   DELETE FROM knowledge;');
                console.log('   然後執行: reset_id_sequence.sql\n');
                
                // 儲存備份到檔案
                fs.writeFileSync(
                    path.join(__dirname, 'knowledge_backup.json'),
                    JSON.stringify(backupData, null, 2)
                );
                console.log('✅ 備份已儲存到: knowledge_backup.json\n');
                return;
            }

            console.log('✅ 舊資料已刪除\n');

            console.log('⚠️  重要提示:');
            console.log('   請在 Supabase Dashboard → SQL Editor 執行:\n');
            console.log('   ALTER SEQUENCE knowledge_id_seq RESTART WITH 1;');
            console.log('   SELECT setval(\'knowledge_id_seq\', 1, false);\n');
            console.log('⏳ 執行完 SQL 後，按 Enter 繼續還原資料...');
            
            await waitForEnter();

            console.log('\n📝 還原資料 (ID 將從 1 開始)...');
            
            for (let i = 0; i < backupData.length; i++) {
                const { data, error } = await supabase
                    .from('knowledge')
                    .insert({ content: backupData[i] })
                    .select();

                if (error) {
                    console.error(`❌ 插入第 ${i + 1} 筆失敗:`, error);
                    // 儲存剩餘資料
                    fs.writeFileSync(
                        path.join(__dirname, 'knowledge_remaining.json'),
                        JSON.stringify(backupData.slice(i), null, 2)
                    );
                    console.log('⚠️  剩餘資料已儲存到: knowledge_remaining.json');
                    return;
                } else {
                    if ((i + 1) % 5 === 0 || i === backupData.length - 1) {
                        console.log(`   進度: ${i + 1}/${backupData.length} (最新ID: ${data[0].id})`);
                    }
                }
            }

            console.log(`✅ 已還原 ${backupData.length} 筆資料\n`);
        }

        // ===== 處理 images 資料表 =====
        console.log('📥 讀取 images 資料...');
        const { data: imagesData, error: imagesReadError } = await supabase
            .from('images')
            .select('*')
            .order('id', { ascending: true });

        if (imagesReadError) {
            console.log('ℹ️  images 資料表不存在或為空\n');
        } else if (imagesData && imagesData.length > 0) {
            console.log(`✅ 讀取到 ${imagesData.length} 筆圖片`);
            console.log(`   目前 ID 範圍: ${imagesData[0].id} ~ ${imagesData[imagesData.length - 1].id}\n`);

            // 備份圖片資料
            const imageBackup = imagesData.map(row => ({
                url: row.url,
                description: row.description
            }));

            console.log('💾 已備份圖片資料');
            console.log('🗑️  刪除舊圖片資料...');

            await supabase.from('images').delete().neq('id', 0);

            console.log('✅ 舊圖片資料已刪除');
            console.log('⚠️  請在 SQL Editor 執行:\n');
            console.log('   ALTER SEQUENCE images_id_seq RESTART WITH 1;');
            console.log('   SELECT setval(\'images_id_seq\', 1, false);\n');
            console.log('⏳ 執行完後按 Enter 繼續...');

            await waitForEnter();

            console.log('\n📝 還原圖片資料...');
            
            const { data: restoredImages, error: restoreError } = await supabase
                .from('images')
                .insert(imageBackup)
                .select();

            if (restoreError) {
                console.error('❌ 還原失敗:', restoreError);
                fs.writeFileSync(
                    path.join(__dirname, 'images_backup.json'),
                    JSON.stringify(imageBackup, null, 2)
                );
                console.log('⚠️  備份已儲存到: images_backup.json');
            } else {
                console.log(`✅ 已還原 ${restoredImages.length} 筆圖片`);
                console.log(`   新 ID 範圍: ${restoredImages[0].id} ~ ${restoredImages[restoredImages.length - 1].id}\n`);
            }
        }

        // 驗證結果
        console.log('🔍 驗證結果...');
        const { data: finalData } = await supabase
            .from('knowledge')
            .select('id')
            .order('id', { ascending: true });

        if (finalData && finalData.length > 0) {
            console.log(`✅ knowledge 共 ${finalData.length} 筆`);
            console.log(`   ID 範圍: ${finalData[0].id} ~ ${finalData[finalData.length - 1].id}`);
            
            if (finalData[0].id === 1) {
                console.log('   🎉 成功! ID 從 1 開始!\n');
            } else {
                console.log(`   ⚠️  注意: ID 從 ${finalData[0].id} 開始\n`);
            }
        }

        // 更新快取
        console.log('🔄 更新快取...');
        const cachePath = path.join(__dirname, 'supabase_embeddings.json');
        if (fs.existsSync(cachePath)) {
            fs.unlinkSync(cachePath);
        }
        
        const result = spawnSync('node', [path.join(__dirname, 'supabase_fetch.js'), '--force'], 
                                 { stdio: 'inherit' });

        console.log('\n🎉 完成!\n');

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
renumberIds();
