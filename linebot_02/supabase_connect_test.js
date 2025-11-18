// supabase_connect_test.js
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: __dirname + '/.env' });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !/^https?:\/\//.test(SUPABASE_URL)) {
  throw new Error('請在 .env 設定正確的 SUPABASE_URL');
}
if (!SUPABASE_ANON_KEY) {
  throw new Error('請在 .env 設定 SUPABASE_ANON_KEY');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testConnection() {
  // 查詢系統 catalog，無需自訂 table
  const { data, error } = await supabase.from('pg_tables').select('tablename').limit(1);
  if (error) {
    console.error('Supabase 連線失敗:', error);
  } else {
    console.log('Supabase 連線成功！');
  }
}

testConnection();
