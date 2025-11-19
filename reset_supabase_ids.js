// reset_supabase_ids.js
// 重設 Supabase 資料表 ID,從 1 開始

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: __dirname + '/.env' });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('請在 .env 設定 SUPABASE_URL 和 SUPABASE_ANON_KEY');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function resetIds() {
    console.log('🔧 開始重設 ID...\n');

    try {
        // 1. 讀取所有現有資料
        console.log('📥 讀取 knowledge 資料表...');
        const { data: knowledgeData, error: readError } = await supabase
            .from('knowledge')
            .select('*')
            .order('id', { ascending: true });

        if (readError) {
            console.error('❌ 讀取失敗:', readError);
            return;
        }

        if (!knowledgeData || knowledgeData.length === 0) {
            console.log('ℹ️  knowledge 資料表是空的');
        } else {
            console.log(`✅ 讀取到 ${knowledgeData.length} 筆資料`);
            console.log(`   目前 ID 範圍: ${knowledgeData[0].id} ~ ${knowledgeData[knowledgeData.length - 1].id}\n`);

            // 2. 刪除所有資料
            console.log('🗑️  刪除所有舊資料...');
            const { error: deleteError } = await supabase
                .from('knowledge')
                .delete()
                .neq('id', 0); // 刪除所有 id != 0 的資料 (即所有資料)

            if (deleteError) {
                console.error('❌ 刪除失敗:', deleteError);
                return;
            }
            console.log('✅ 舊資料已刪除\n');

            // 3. 重新插入資料 (不指定 id,讓資料庫自動產生)
            console.log('📝 重新插入資料 (從 ID 1 開始)...');
            const newData = knowledgeData.map(row => ({
                content: row.content,
                // 不包含 id,讓資料庫自動產生
            }));

            const { data: insertedData, error: insertError } = await supabase
                .from('knowledge')
                .insert(newData)
                .select();

            if (insertError) {
                console.error('❌ 插入失敗:', insertError);
                return;
            }

            console.log(`✅ 已重新插入 ${insertedData.length} 筆資料`);
            if (insertedData.length > 0) {
                console.log(`   新的 ID 範圍: ${insertedData[0].id} ~ ${insertedData[insertedData.length - 1].id}\n`);
            }
        }

        // 4. 重設序列 (確保下一個 ID 從正確的數字開始)
        console.log('🔄 重設 ID 序列...');
        
        // 查詢最大 ID
        const { data: maxData, error: maxError } = await supabase
            .from('knowledge')
            .select('id')
            .order('id', { ascending: false })
            .limit(1);

        if (maxError) {
            console.error('❌ 查詢最大 ID 失敗:', maxError);
        } else {
            const maxId = maxData && maxData.length > 0 ? maxData[0].id : 0;
            console.log(`   最大 ID: ${maxId}`);
            console.log(`   下一個 ID 將是: ${maxId + 1}\n`);
        }

        // 5. 處理 images 資料表
        console.log('📥 讀取 images 資料表...');
        const { data: imagesData, error: imagesReadError } = await supabase
            .from('images')
            .select('*')
            .order('id', { ascending: true });

        if (imagesReadError) {
            console.log('ℹ️  images 資料表不存在或為空:', imagesReadError.message);
        } else if (imagesData && imagesData.length > 0) {
            console.log(`✅ 讀取到 ${imagesData.length} 筆圖片資料`);
            console.log(`   目前 ID 範圍: ${imagesData[0].id} ~ ${imagesData[imagesData.length - 1].id}\n`);

            // 刪除並重新插入
            console.log('🗑️  刪除 images 舊資料...');
            await supabase.from('images').delete().neq('id', 0);
            
            console.log('📝 重新插入 images 資料...');
            const newImages = imagesData.map(row => ({
                url: row.url,
                description: row.description
            }));

            const { data: insertedImages, error: imagesInsertError } = await supabase
                .from('images')
                .insert(newImages)
                .select();

            if (imagesInsertError) {
                console.error('❌ images 插入失敗:', imagesInsertError);
            } else {
                console.log(`✅ 已重新插入 ${insertedImages.length} 筆圖片資料`);
                if (insertedImages.length > 0) {
                    console.log(`   新的 ID 範圍: ${insertedImages[0].id} ~ ${insertedImages[insertedImages.length - 1].id}\n`);
                }
            }
        }

        console.log('🎉 ID 重設完成!\n');
        console.log('💡 下一步:');
        console.log('   1. 執行 node supabase_fetch.js --force 更新快取');
        console.log('   2. 或執行 node clear_cache.js 清除快取\n');

    } catch (error) {
        console.error('❌ 發生錯誤:', error);
    }
}

// 執行
resetIds();
