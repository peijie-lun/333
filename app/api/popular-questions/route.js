import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export async function GET() {
  try {
    // 查詢最近30天的問題記錄
    const { data, error } = await supabase
      .from('chat_log')
      .select('raw_question, intent')
      .not('raw_question', 'is', null)
      .not('raw_question', 'like', 'clarify:%') // 排除澄清選項
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()) // 最近30天
      .order('created_at', { ascending: false });

    if (error) {
      console.error('查詢熱門問題失敗:', error);
      return new Response(JSON.stringify({ error: '查詢失敗' }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 在 JavaScript 中進行統計分組
    const questionStats = {};
    data?.forEach(record => {
      const question = record.raw_question?.trim();
      if (question && question.length > 0) {
        if (questionStats[question]) {
          questionStats[question].count++;
        } else {
          questionStats[question] = {
            raw_question: question,
            intent: record.intent,
            count: 1
          };
        }
      }
    });

    // 轉換為陣列並排序
    const popularQuestions = Object.values(questionStats)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map(item => ({
        raw_question: item.raw_question,
        intent: item.intent,
        question_count: item.count
      }));

    // 如果沒有數據，使用模擬數據
    const result = popularQuestions.length > 0 ? popularQuestions : [
      { raw_question: '包裹', intent: '包裹', question_count: 15 },
      { raw_question: '管理費', intent: '管費', question_count: 12 },
      { raw_question: '停車', intent: '停車', question_count: 8 },
      { raw_question: '公共設施', intent: '設施', question_count: 7 },
      { raw_question: '訪客', intent: '訪客', question_count: 6 }
    ];

    return new Response(JSON.stringify({
      success: true,
      data: result
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('熱門問題 API 錯誤:', err);
    return new Response(JSON.stringify({ error: '服務器錯誤' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}