// embedding.js - 使用 Cohere API 生成 embedding (取代 Python 版本)

import dotenv from 'dotenv';
import { CohereClient } from 'cohere-ai';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: __dirname + '/.env' });

const cohere = new CohereClient({
  token: process.env.COHERE_API_KEY,
});

/**
 * 生成文字的 embedding 向量
 * @param {string} text - 要轉換的文字
 * @param {string} inputType - 'search_query' 或 'search_document'
 * @returns {Promise<number[]>} - embedding 向量
 */
async function getEmbedding(text, inputType = 'search_query') {
  try {
    const response = await cohere.embed({
      model: 'embed-multilingual-v3.0',
      texts: [text],
      inputType: inputType,
    });

    return response.embeddings[0];
  } catch (error) {
    console.error('[Embedding] 生成失敗:', error.message);
    return null;
  }
}

/**
 * 批次生成多個文字的 embedding
 * @param {string[]} texts - 文字陣列
 * @param {string} inputType - 'search_query' 或 'search_document'
 * @returns {Promise<number[][]>} - embedding 向量陣列
 */
async function getEmbeddings(texts, inputType = 'search_document') {
  try {
    const response = await cohere.embed({
      model: 'embed-multilingual-v3.0',
      texts: texts,
      inputType: inputType,
    });

    return response.embeddings;
  } catch (error) {
    console.error('[Embedding] 批次生成失敗:', error.message);
    return null;
  }
}


export { getEmbedding, getEmbeddings };
