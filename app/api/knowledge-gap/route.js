import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const days = parseInt(searchParams.get('days') || '7');
    const limit = parseInt(searchParams.get('limit') || '20');

    // 1. 知識缺口排行榜（answered = false 的問題）
    const { data: knowledgeGap, error: gapError } = await supabase
      .from('chat_log')
      .select('normalized_question, raw_question, intent, created_at')
      .eq('answered', false)
      .gte('created_at', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false });

    if (gapError) {
      console.error('知識缺口查詢錯誤:', gapError);
      return new Response(JSON.stringify({ error: '查詢失敗' }), { status: 500 });
    }

    // 統計每個正規化問題的出現次數
    const gapStats = {};
    knowledgeGap.forEach(item => {
      const key = item.normalized_question;
      if (!gapStats[key]) {
        gapStats[key] = {
          normalized_question: item.normalized_question,
          intent: item.intent,
          count: 0,
          examples: []
        };
      }
      gapStats[key].count++;
      if (gapStats[key].examples.length < 3) {
        gapStats[key].examples.push(item.raw_question);
      }
    });

    // 轉換成陣列並排序
    const gapRanking = Object.values(gapStats)
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);

    // 2. 各 intent 的知識缺口統計
    const intentStats = {};
    knowledgeGap.forEach(item => {
      const intent = item.intent || '未分類';
      intentStats[intent] = (intentStats[intent] || 0) + 1;
    });

    const intentRanking = Object.entries(intentStats)
      .map(([intent, count]) => ({ intent, count }))
      .sort((a, b) => b.count - a.count);

    // 3. 總體統計
    const { data: totalStats, error: statsError } = await supabase
      .from('chat_log')
      .select('answered')
      .gte('created_at', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString());

    if (statsError) {
      console.error('統計查詢錯誤:', statsError);
    }

    const totalCount = totalStats?.length || 0;
    const answeredCount = totalStats?.filter(item => item.answered).length || 0;
    const unansweredCount = totalCount - answeredCount;
    const answerRate = totalCount > 0 ? (answeredCount / totalCount * 100).toFixed(2) : 0;

    return new Response(JSON.stringify({
      summary: {
        totalQuestions: totalCount,
        answeredQuestions: answeredCount,
        unansweredQuestions: unansweredCount,
        answerRate: parseFloat(answerRate),
        days
      },
      knowledgeGapRanking: gapRanking,
      intentRanking: intentRanking
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('API 錯誤:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
