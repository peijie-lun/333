// grokmain.js - 使用 Supabase pgvector 版本

import dotenv from 'dotenv';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import { getEmbedding } from './embedding.js';

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: __dirname + '/.env' });

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama3-8b-8192';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 同義詞字典
const SYNONYMS = {
  '包裹': ['包裹', '郵件', '快遞', '宅配', '包包', '貨物', '寄件', '收件', '掛號'],
  '管費': ['管理費', '繳費', '費用', '管費', '月費', '社區費', '大樓費用', '管委會費用', '公共基金'],
  '訪客': ['訪客', '來訪', '客人', '訪問', '拜訪', '朋友來', '親友', '訪友'],
  '設施': ['設施', '公設', '公共設施', '健身房', '游泳池', '大廳', '會議室', '交誼廳', '閱覽室', '停車場'],
  '停車': ['停車', '車位', '停車場', '停車位', '車庫', '汽車', '機車', '停車費'],
  '維修': ['維修', '修理', '故障', '壞掉', '報修', '損壞', '不能用', '維護', '保養'],
  '投訴': ['投訴', '抱怨', '檢舉', '申訴', '反應', '反映', '建議', '意見'],
  '安全': ['安全', '保全', '門禁', '監視器', '警衛', '安全性', '防盜', '巡邏'],
  '垃圾': ['垃圾', '回收', '資源回收', '廚餘', '清潔', '打掃', '環境'],
  '寵物': ['寵物', '狗', '貓', '動物', '毛小孩', '養寵物'],
  '噪音': ['噪音', '吵', '聲音', '太吵', '噪音問題', '擾民', '安寧'],
  '會議': ['會議', '住戶大會', '區權會', '管委會', '開會', '會議紀錄'],
  '公告': ['公告', '通知', '消息', '最新消息', '公布', '佈告欄'],
  '其他': []
};

/**
 * 產生澄清選項
 * 從 Top-N FAQ 結果生成追問選項
 * @param {Array} searchResults - 搜尋結果陣列
 * @param {string} intent - 分類意圖
 * @param {string} originalQuery - 原始問題
 * @returns {Object} { message: string, options: Array<{label, value}> }
 */
function generateClarificationOptions(searchResults, intent, originalQuery) {
  console.log('[Clarification] 產生澄清選項...');
  
  // 取前 3-5 個結果
  const topResults = searchResults.slice(0, Math.min(5, searchResults.length));
  
  // 根據意圖生成不同的澄清訊息
  let message = '';
  const options = [];
  
  switch(intent) {
    case 'package':
    case '包裹':
      message = '🤔 您是想問關於包裹的哪方面呢？';
      options.push(
        { label: '📦 領包裹流程', value: 'clarify:package_pickup' },
        { label: '📮 寄包裹方式', value: 'clarify:package_send' },
        { label: '⏰ 包裹室時間', value: 'clarify:package_hours' }
      );
      break;
      
    case 'fee':
    case '管費':
      message = '🤔 您是想問關於管理費的哪方面呢？';
      options.push(
        { label: '💰 繳費金額', value: 'clarify:fee_amount' },
        { label: '📅 繳費日期', value: 'clarify:fee_date' },
        { label: '💳 繳費方式', value: 'clarify:fee_method' }
      );
      break;
      
    case 'visitor':
    case '訪客':
      message = '🤔 您是想問關於訪客的哪方面呢？';
      options.push(
        { label: '🚪 訪客登記', value: 'clarify:visitor_register' },
        { label: '🅿️ 訪客停車', value: 'clarify:visitor_parking' },
        { label: '⏰ 訪客時間', value: 'clarify:visitor_hours' }
      );
      break;
      
    case 'facility':
    case '設施':
      message = '🤔 您是想問關於設施的哪方面呢？';
      options.push(
        { label: '🏊 使用規定', value: 'clarify:facility_rules' },
        { label: '📅 預約方式', value: 'clarify:facility_booking' },
        { label: '⏰ 開放時間', value: 'clarify:facility_hours' }
      );
      break;
      
    default:
      // 通用澄清：從 Top-N 結果擷取關鍵概念
      message = '🤔 請問您是想了解以下哪個問題呢？';
      
      // 從搜尋結果提取選項
      topResults.forEach((result, index) => {
        // 從內容中提取簡短標題（限制 15 字以內）
        const contentPreview = result.content
          .replace(/[\r\n]+/g, ' ')
          .substring(0, 15);
        
        options.push({
          label: `${index + 1}. ${contentPreview}`,
          value: `clarify:faq_${result.id}`
        });
      });
  }
  
  // 永遠加上「其他問題」選項
  options.push({ label: '❓ 其他問題', value: 'clarify:other' });
  
  console.log(`[Clarification] 產生 ${options.length} 個選項`);
  
  return { message, options };
}

// 正規化問題：去標點、統一小寫、同義詞替換
function normalizeQuestion(text) {
  // 1. 去除標點符號（保留中英文、數字、空格）
  let normalized = text.replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s]/g, '');
  
  // 2. 統一轉小寫
  normalized = normalized.toLowerCase();
  
  // 3. 去除多餘空白
  normalized = normalized.replace(/\s+/g, ' ').trim();
  
  // 4. 同義詞替換：將同義詞統一為主詞
  for (const [mainWord, synonyms] of Object.entries(SYNONYMS)) {
    for (const synonym of synonyms) {
      if (normalized.includes(synonym.toLowerCase())) {
        normalized = normalized.replace(new RegExp(synonym.toLowerCase(), 'g'), mainWord);
      }
    }
  }
  
  return normalized;
}

// Intent 分類函數（依關鍵字與信心度）
function classifyIntent(text) {
  const lowerText = text.toLowerCase();
  
  // 定義每個 intent 的關鍵字與權重
  const intentPatterns = [
    { intent: '包裹', keywords: ['包裹', '郵件', '快遞', '宅配', '收件', '寄件', '掛號'], confidence: 0.9 },
    { intent: '管費', keywords: ['管理費', '繳費', '費用', '管費', '月費', '社區費', '滯納金'], confidence: 0.9 },
    { intent: '訪客', keywords: ['訪客', '來訪', '客人', '訪問', '拜訪', '親友'], confidence: 0.85 },
    { intent: '設施', keywords: ['設施', '公設', '健身房', '游泳池', '大廳', '會議室', '交誼廳', '停車場'], confidence: 0.85 },
    { intent: '停車', keywords: ['停車', '車位', '停車場', '車庫', '汽車', '機車'], confidence: 0.85 },
    { intent: '維修', keywords: ['維修', '修理', '故障', '壞掉', '報修', '損壞', '不能用'], confidence: 0.85 },
    { intent: '投訴', keywords: ['投訴', '抱怨', '檢舉', '申訴', '反應', '反映'], confidence: 0.8 },
    { intent: '安全', keywords: ['安全', '保全', '門禁', '監視器', '警衛', '防盜'], confidence: 0.85 },
    { intent: '垃圾', keywords: ['垃圾', '回收', '資源回收', '廚餘', '清潔'], confidence: 0.85 },
    { intent: '寵物', keywords: ['寵物', '狗', '貓', '動物', '毛小孩'], confidence: 0.85 },
    { intent: '噪音', keywords: ['噪音', '吵', '太吵', '擾民', '安寧'], confidence: 0.85 },
    { intent: '會議', keywords: ['會議', '住戶大會', '區權會', '管委會', '開會'], confidence: 0.85 },
    { intent: '公告', keywords: ['公告', '通知', '消息', '最新消息', '佈告欄'], confidence: 0.8 },
  ];
  
  // 計算每個 intent 的匹配度
  let bestMatch = { intent: null, confidence: 0 };
  
  for (const pattern of intentPatterns) {
    let matchCount = 0;
    for (const keyword of pattern.keywords) {
      if (lowerText.includes(keyword.toLowerCase())) {
        matchCount++;
      }
    }
    
    if (matchCount > 0) {
      const confidence = Math.min(pattern.confidence * (matchCount / pattern.keywords.length * 2), 1.0);
      if (confidence > bestMatch.confidence) {
        bestMatch = { intent: pattern.intent, confidence };
      }
    }
  }
  
  return bestMatch;
}

// 主要聊天函數
async function chat(query) {
  console.log(`\n[Query] 問題: ${query}`);
  console.log('[Debug] Step 1: 產生 embedding 前');
  
  // 初始化 chat_log 相關變數
  const normalized_question = normalizeQuestion(query);
  console.log(`[Normalized] 正規化後: ${normalized_question}`);
  
  const intentResult = classifyIntent(query);
  let intent = intentResult.intent;
  let intent_confidence = intentResult.confidence > 0 ? intentResult.confidence : null;
  console.log(`[Intent] 意圖: ${intent || '未知'} (信心度: ${intent_confidence || 'N/A'})`);
  
  let answered = false;
  let maxSimilarity = 0;
  
  // 1. 生成問題的 embedding (使用 Cohere)
  const queryEmbedding = await getEmbedding(query, 'search_query');
  console.log('[Debug] Step 1: 產生 embedding 後', queryEmbedding ? '成功' : '失敗');
  if (!queryEmbedding) {
    return { error: 'embedding 生成失敗' };
  }

  // 2. 使用 Supabase RPC 函數搜尋相似內容
  console.log('[Debug] Step 2: Supabase search_knowledge 前');
  const { data: searchResults, error: searchError } = await supabase.rpc('search_knowledge', {
    query_embedding: queryEmbedding,
    match_threshold: 0.8,
    match_count: 5
  });
  console.log('[Debug] Step 2: Supabase search_knowledge 後', searchResults ? '有結果' : '無結果', searchError ? searchError : '');
  if (searchError) {
    console.error('[Error] 搜尋失敗:', searchError);
    return { error: '搜尋失敗' };
  }

  let finalResults = searchResults;
  let maxSim = searchResults?.[0]?.similarity || 0;
  maxSimilarity = maxSim; // 記錄最高相似度

  // 3. Fallback: 如果相似度太低,使用關鍵字搜尋
  if (!searchResults || searchResults.length === 0 || maxSim < 0.9) {
    console.log('[Debug] Step 3: 進入關鍵字 fallback');
    console.log('[Fallback] 相似度不足,啟用關鍵字搜尋...');
    
    // 拆解關鍵字 (n-gram)
    const words = query.match(/[\u4e00-\u9fa5]|\w+/g) || [];
    let ngrams = [];
    for (let n = 1; n <= 3; n++) {
      for (let i = 0; i <= words.length - n; i++) {
        ngrams.push(words.slice(i, i + n).join(''));
      }
    }
    
    console.log(`[Keywords] ${ngrams.slice(0, 10).join(', ')}`);

    // 從資料庫用關鍵字搜尋
    console.log('[Debug] Step 3: Supabase 關鍵字查詢前');
    const { data: allData } = await supabase
      .from('knowledge')
      .select('id, content')
      .not('embedding', 'is', null);
    console.log('[Debug] Step 3: Supabase 關鍵字查詢後', allData ? `共${allData.length}筆` : '無資料');

    if (allData) {
      const keywordMatches = allData.filter(item => 
        ngrams.some(kw => item.content.includes(kw))
      );

      console.log(`[Match] 關鍵字命中 ${keywordMatches.length} 筆`);
      
      if (keywordMatches.length > 0) {
        finalResults = keywordMatches.slice(0, 3).map((item, idx) => ({
          id: item.id,
          content: item.content,
          similarity: 0.5 - idx * 0.1  // 模擬相似度
        }));
        // 更新 maxSimilarity 為 fallback 結果的最高相似度
        maxSimilarity = finalResults[0]?.similarity || 0;
        console.log(`[Fallback] 更新 maxSimilarity 為: ${maxSimilarity}`);
      }
    }
  }

  if (!finalResults || finalResults.length === 0) {
    console.log('[Debug] Step 4: 沒有任何相關資料');
    console.log('[Error] 找不到任何相關資料');
    return { 
      answer: '抱歉，我找不到相關資料來回答這個問題。',
      normalized_question,
      intent,
      intent_confidence,
      answered: false
    };
  }

  // ===== 追問澄清機制 =====
  // 只有當問題很短且模糊時才觸發澄清（避免具體問題被誤判）
  const SIMILARITY_THRESHOLD = 0.65;
  const INTENT_CONFIDENCE_THRESHOLD = 0.6;
  const SHORT_QUESTION_LENGTH = 3; // 問題長度少於等於3字才考慮澄清
  
  // 判斷是否為短且模糊的問題
  const isShortQuestion = query.length <= SHORT_QUESTION_LENGTH;
  const isLowConfidence = maxSimilarity < SIMILARITY_THRESHOLD || intent_confidence < INTENT_CONFIDENCE_THRESHOLD;
  const needsClarification = isShortQuestion && isLowConfidence;
  
  if (needsClarification) {
    console.log(`[Clarification] 觸發追問機制 - 問題長度: ${query.length}, 相似度: ${maxSimilarity}, 意圖信心度: ${intent_confidence}`);
    
    // 產生澄清選項
    const clarificationData = generateClarificationOptions(finalResults, intent, query);
    
    return {
      needsClarification: true,
      clarificationMessage: clarificationData.message,
      clarificationOptions: clarificationData.options,
      normalized_question,
      intent,
      intent_confidence,
      answered: false,
      similarity: maxSimilarity
    };
  }

  // 4. 顯示搜尋結果
  console.log('[Debug] Step 5: 顯示搜尋結果');
  console.log('\n[Results] 最終結果前 3 筆:');
  finalResults.slice(0, 3).forEach((item, idx) => {
    console.log(`\n#${idx + 1} 相似度: ${(item.similarity * 100).toFixed(2)}%`);
    console.log(`內容: ${item.content.substring(0, 100)}...`);
  });

  // 5. 組合上下文
  console.log('[Debug] Step 6: 組合上下文');
  const context = finalResults
    .slice(0, 3)
    .map(item => item.content)
    .join('\n\n---\n\n');

  // 5. 搜尋相關圖片
  console.log('[Debug] Step 7: 搜尋相關圖片前');
  const { data: imageResults } = await supabase.rpc('search_images', {
    query_embedding: queryEmbedding,
    match_threshold: 0.6,
    match_count: 3
  });
  console.log('[Debug] Step 7: 搜尋相關圖片後', imageResults ? `共${imageResults.length}張` : '無資料');
  const images = imageResults?.map(img => img.url) || [];
  if (images.length > 0) {
    console.log(`\n[Images] 找到 ${images.length} 張相關圖片`);
  }

  // 6. 呼叫 Groq API 生成回答
  console.log('[Debug] Step 8: 呼叫 Groq API 前');
  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: GROQ_MODEL,
        messages: [
          {
            role: 'system',
            content: '你是檢索增強型助理，回答一律使用繁體中文，只能根據參考資料回答，不可補充或推測任何未在參考資料中的內容。'
          },
          {
            role: 'user',
            content: `問題：${query}\n\n參考資料：\n${context}`
          }
        ],
        temperature: 0.3
      },
      {
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`
        }
      }
    );
    console.log('[Debug] Step 8: Groq API 回傳', response.data);
    const answer = response.data.choices[0].message.content;
    console.log(`\n[Answer] 回答:\n${answer}\n`);

    // 判斷 answered：
    // 1. 檢查回答內容是否為「找不到」、「無法回答」、「沒有提及」等否定回答
    // 2. 只要不是否定回答，且有找到參考資料，就視為成功回答
    const negativePatterns = [
      '找不到相關資料',
      '沒有找到',
      '無法回答',
      '沒有提及',
      '並無提及',
      '無相關',
      '未提及',
      '沒有提到',
      '無法提供',
      '抱歉'
    ];
    const isNotFoundAnswer = negativePatterns.some(pattern => answer.includes(pattern));
    
    // 只要有找到資料且成功生成答案（非否定回答），就是 answered = true
    answered = !isNotFoundAnswer && finalResults.length > 0;
    console.log(`[Answered] ${answered} (相似度: ${maxSimilarity}, 有結果: ${finalResults.length > 0}, 否定回答: ${isNotFoundAnswer})`);

    // 注意：chat_log 寫入已移到 app/api/line/route.js 統一處理，這裡不再重複寫入

    return {
      answer,
      images,
      sources: searchResults.slice(0, 3),
      // 回傳 intent 相關資訊給呼叫方
      normalized_question,
      intent,
      intent_confidence,
      answered
    };
  } catch (error) {
    console.error('[Error] Groq API 錯誤:', error.response?.data || error.message);
    
    // 不在這裡寫入 chat_log，由呼叫方統一處理
    
    return { 
      error: 'AI 回答生成失敗',
      // 即使失敗也要回傳這些資訊
      normalized_question,
      intent,
      intent_confidence,
      answered: false
    };
  }
}

export { chat };
