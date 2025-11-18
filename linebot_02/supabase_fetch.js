// supabase_fetch.js
// 從 Supabase 讀取資料表內容，自動產生 embedding 並快取到 supabase_embeddings.json

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: __dirname + '/.env' });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !/^https?:\/\//.test(SUPABASE_URL)) {
	throw new Error('請在 .env 設定正確的 SUPABASE_URL (必須 http(s) 開頭)');
}
if (!SUPABASE_ANON_KEY) {
	throw new Error('請在 .env 設定 SUPABASE_ANON_KEY');
}

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const cachePath = path.join(__dirname, 'supabase_embeddings.json');

function getEmbedding(text) {
	const py = spawnSync('python', [__dirname + '/embedding.py', text], { encoding: 'utf-8' });
	if (py.error || py.status !== 0) return null;
	try {
		return JSON.parse(py.stdout);
	} catch {
		return null;
	}
}

async function fetchAndCache() {
		// 預設 FAQ
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
		// 查詢現有 FAQ
		const { data: existData, error: existError } = await supabase
			.from('knowledge')
			.select('content');
		if (existError) {
			console.error('Supabase 讀取 knowledge 失敗:', existError);
			return;
		}
		const existSet = new Set((existData || []).map(row => row.content));
		// 自動補齊缺少的 FAQ
		for (const faq of defaultFaqs) {
			if (!existSet.has(faq)) {
				const { error: insErr } = await supabase.from('knowledge').insert({ content: faq });
				if (insErr) {
					console.error('自動補 FAQ 失敗:', faq, insErr);
				} else {
					console.log('已自動補 FAQ：', faq);
				}
			}
		}
		// 重新查詢最新 FAQ
		const { data, error } = await supabase
			.from('knowledge')
			.select('id, content');
		if (error) {
			console.error('Supabase 讀取 knowledge 失敗:', error);
			return;
		}
		if (!data || data.length === 0) {
			console.log('knowledge table 無資料');
			return;
		}
	let cache = {};
	if (fs.existsSync(cachePath)) {
		try {
			cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
		} catch {}
	}
		let updated = false;
		for (const row of data) {
			const key = String(row.id);
			if (!cache[key] || cache[key].content !== row.content) {
				const embedding = getEmbedding(row.content);
				if (embedding) {
					cache[key] = { content: row.content, embedding };
					updated = true;
					console.log(`已更新 embedding: id=${key}`);
				} else {
					console.error(`embedding 失敗: id=${key}`);
				}
			}
		}
		if (updated) {
			fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf-8');
			console.log('supabase_embeddings.json 已更新');
		} else {
			console.log('所有 embedding 已是最新');
		}
		console.log('快取成功 id：', Object.keys(cache));

	// 抓取圖片 URL 資料
	const { data: imageData, error: imageError } = await supabase
		.from('images')
		.select('id, url, description');
	
	if (imageError) {
		console.log('images table 不存在或查詢失敗，跳過圖片資料:', imageError.message);
	} else if (imageData && imageData.length > 0) {
		console.log(`\n成功抓取 ${imageData.length} 筆圖片資料：`);
		imageData.forEach(img => {
			console.log(`  - ID: ${img.id}, URL: ${img.url}, 描述: ${img.description || '無'}`);
		});
		
		// 將圖片資料也加入 cache，方便 AI 查詢
		for (const img of imageData) {
			const imgKey = `img_${img.id}`;
			const imgContent = `圖片: ${img.description || '無描述'}\nURL: ${img.url}`;
			if (!cache[imgKey] || cache[imgKey].content !== imgContent) {
				const embedding = getEmbedding(imgContent);
				if (embedding) {
					cache[imgKey] = { content: imgContent, embedding, type: 'image', url: img.url };
					console.log(`已加入圖片 embedding: ${imgKey}`);
				}
			}
		}
		
		// 更新快取檔案
		fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf-8');
		console.log('圖片資料已加入快取');
	}
}

fetchAndCache();
