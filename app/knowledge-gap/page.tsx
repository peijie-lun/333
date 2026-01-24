'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';

const KnowledgeGapBar = dynamic(() => import('./KnowledgeGapChart').then(m => m.KnowledgeGapBar), { ssr: false });
const IntentPie = dynamic(() => import('./KnowledgeGapChart').then(m => m.IntentPie), { ssr: false });

// --------------------
// Types
// --------------------

type KnowledgeGapItem = {
  normalized_question: string;
  intent: string | null;
  count: number;
  examples: string[];
};

type IntentRankingItem = {
  intent: string;
  count: number;
};

type KnowledgeGapData = {
  summary: {
    totalQuestions: number;
    answeredQuestions: number;
    unansweredQuestions: number;
    answerRate: number;
    days: number;
  };
  knowledgeGapRanking: KnowledgeGapItem[];
  intentRanking: IntentRankingItem[];
};

// --------------------
// Page
// --------------------

export default function KnowledgeGapPage() {
  const [data, setData] = useState<KnowledgeGapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);

  useEffect(() => {
    fetchData();
  }, [days]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/knowledge-gap?days=${days}&limit=20`);
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error('載入失敗:', err);
    }
    setLoading(false);
  };

  if (loading) return <LoadingSkeleton />;

  if (!data) {
    return (
      <div className="min-h-screen grid place-items-center bg-neutral-50">
        <div className="text-red-600 text-lg font-semibold">載入失敗</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 to-rose-50">
      {/* Header */}
      <header className="sticky top-0 z-20 backdrop-blur bg-white/80 border-b shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-sky-400 text-white grid place-items-center text-3xl shadow">📊</div>
            <div>
              <h1 className="text-3xl font-black tracking-tight text-neutral-900 leading-tight mb-1">知識缺口分析</h1>
              <p className="text-base text-neutral-500 font-medium">用數據決定該補什麼知識</p>
            </div>
          </div>
          <div className="flex gap-2 mt-2 md:mt-0">
            {[7, 14, 30].map(d => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-5 py-2 rounded-full text-base font-bold border shadow-sm transition-all duration-150 ${
                  days === d
                    ? 'bg-gradient-to-r from-indigo-500 to-sky-400 text-white border-indigo-500 scale-105'
                    : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-100'
                }`}
              >
                {d} 天
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-12 space-y-12">
        {/* Summary */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <StatCard title="總提問" value={data.summary.totalQuestions} tone="indigo" />
          <StatCard title="已回答" value={data.summary.answeredQuestions} tone="emerald" />
          <StatCard title="知識缺口" value={data.summary.unansweredQuestions} tone="rose" />
          <StatCard title="回答率" value={`${data.summary.answerRate}%`} tone="sky" />
        </section>

        {/* Content */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          {/* Ranking */}
          <div className="lg:col-span-2 bg-white rounded-2xl border shadow-md">
            <div className="bg-gradient-to-r from-rose-500 to-pink-400 px-6 py-5 rounded-t-2xl">
              <h2 className="font-black text-xl text-white flex items-center gap-2">
                <span className="text-2xl">🔥</span> 知識缺口排行榜
              </h2>
              <p className="text-rose-100 text-sm font-medium mt-1">最該優先補的問題</p>
            </div>
            {data.knowledgeGapRanking.length === 0 ? (
              <EmptyState />
            ) : (
              <div className="p-6 space-y-6">
                <KnowledgeGapBar ranking={data.knowledgeGapRanking.slice(0, 8)} />
                <div className="space-y-5">
                  {data.knowledgeGapRanking.map((item, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.03 }}
                      className="relative rounded-2xl border border-rose-200 bg-white p-6 shadow-md hover:shadow-lg transition group overflow-hidden"
                    >
                      <div className="absolute left-0 top-0 h-full w-2 rounded-l-2xl bg-gradient-to-b from-rose-400 to-rose-200 opacity-80 group-hover:from-rose-500 group-hover:to-rose-300 transition" />
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <div className="text-3xl font-black text-rose-500 drop-shadow-sm">#{index + 1}</div>
                          <div className="space-y-1">
                            <div className="font-bold text-lg text-neutral-900 group-hover:text-rose-700 transition">
                              {item.normalized_question}
                            </div>
                            {item.intent && (
                              <span className="inline-block mt-1 px-3 py-1 text-xs bg-rose-100 text-rose-700 rounded-full font-bold tracking-wide border border-rose-200">
                                {item.intent}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="flex items-center gap-1 bg-rose-500 text-white px-4 py-1 rounded-full text-base font-bold shadow">
                          <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 15h-2v-2h2v2Zm0-4h-2V7h2v6Z"/></svg>
                          {item.count}
                        </span>
                      </div>
                      <div className="mt-4 pl-12">
                        <div className="text-xs text-neutral-400 mb-1 font-medium">原始問題範例：</div>
                        <ul className="space-y-1">
                          {item.examples.map((ex, i) => (
                            <li key={i} className="text-base text-neutral-700 bg-rose-50 px-3 py-1 rounded shadow-sm border border-rose-100">
                              <span className="text-rose-400 mr-2">•</span>{ex}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Intent */}
          <div className="bg-white rounded-2xl border shadow-md">
            <div className="bg-gradient-to-r from-sky-500 to-indigo-500 px-6 py-5 rounded-t-2xl">
              <h2 className="font-black text-xl text-white flex items-center gap-2">
                <span className="text-2xl">📋</span> 問題類別
              </h2>
              <p className="text-sky-100 text-sm font-medium mt-1">Intent 分佈統計</p>
            </div>
            <div className="p-6 space-y-6">
              <IntentPie ranking={data.intentRanking} />
              <div className="space-y-3">
                {data.intentRanking.map((item, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="flex items-center justify-between rounded-xl border-2 border-sky-100 bg-gradient-to-r from-sky-50 to-white px-5 py-3 hover:border-sky-300 hover:shadow-md transition group"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl font-black text-sky-400 group-hover:text-sky-600 transition">#{index + 1}</span>
                      <span className="font-bold text-neutral-800 group-hover:text-sky-700 transition">{item.intent}</span>
                    </div>
                    <span className="bg-gradient-to-r from-sky-500 to-indigo-500 text-white px-3 py-1 rounded-full text-sm font-bold shadow">{item.count}</span>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Tips */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="rounded-2xl border-2 border-amber-200 bg-gradient-to-br from-amber-50 to-yellow-50 p-8 shadow-lg"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-400 text-white grid place-items-center text-xl shadow">💡</div>
            <h3 className="text-2xl font-black text-amber-900">改善建議</h3>
          </div>
          <ul className="space-y-3">
            {[
              { icon: '🎯', text: '優先補齊排行榜前 3 名問題' },
              { icon: '📚', text: '針對高頻 intent 建立標準答案' },
              { icon: '🔄', text: '合併相似問題，減少重複缺口' },
              { icon: '📊', text: '每週固定檢視，形成 KMS 迭代循環' }
            ].map((tip, idx) => (
              <li key={idx} className="flex items-start gap-3 text-base text-amber-900 bg-white/60 px-4 py-3 rounded-xl border border-amber-200 hover:bg-white hover:shadow-md transition">
                <span className="text-xl">{tip.icon}</span>
                <span className="font-semibold">{tip.text}</span>
              </li>
            ))}
          </ul>
        </motion.section>
      </main>
    </div>
  );
}

// --------------------
// Components
// --------------------

function StatCard({ title, value, tone }: { title: string; value: any; tone: 'indigo' | 'emerald' | 'rose' | 'sky' }) {
  const tones: Record<string, string> = {
    indigo: 'from-indigo-500 to-indigo-400',
    emerald: 'from-emerald-500 to-emerald-400',
    rose: 'from-rose-500 to-rose-400',
    sky: 'from-sky-500 to-sky-400',
  };
  return (
    <div className="rounded-2xl border bg-white p-6 shadow-md flex flex-col items-center hover:shadow-lg transition">
      <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${tones[tone]} text-white grid place-items-center mb-2 text-xl font-black shadow`}>{title[0]}</div>
      <div className="text-3xl font-black text-neutral-900 mb-1">{value}</div>
      <div className="text-base text-neutral-500 font-semibold tracking-wide">{title}</div>
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="bg-gradient-to-r from-rose-500 to-pink-400 px-6 py-5 rounded-t-2xl">
      <h2 className="font-black text-xl text-white flex items-center gap-2">
        <span className="text-2xl">🔥</span> {title}
      </h2>
      {subtitle && <p className="text-rose-100 text-sm font-medium mt-1">{subtitle}</p>}
    </div>
  );
}

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="p-16 text-center"
    >
      <div className="text-7xl mb-4">🎉</div>
      <div className="text-2xl font-black text-emerald-600 mb-2">太棒了！</div>
      <div className="text-lg text-neutral-500 font-medium">目前沒有知識缺口</div>
    </motion.div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 to-rose-50">
      <div className="max-w-5xl mx-auto px-4 py-12 space-y-12">
        <div className="h-16 w-80 bg-gradient-to-r from-neutral-200 to-neutral-300 rounded-2xl animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 bg-white border rounded-2xl shadow-md animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          <div className="lg:col-span-2 h-96 bg-white border rounded-2xl shadow-md animate-pulse" />
          <div className="h-96 bg-white border rounded-2xl shadow-md animate-pulse" />
        </div>
      </div>
    </div>
  );
}
