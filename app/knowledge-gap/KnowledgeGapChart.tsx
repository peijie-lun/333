"use client";
import { Bar, Pie } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement);

export function KnowledgeGapBar({ ranking }: { ranking: { normalized_question: string, count: number }[] }) {
  const data = {
    labels: ranking.map(item => item.normalized_question.length > 16 ? item.normalized_question.slice(0, 16) + '…' : item.normalized_question),
    datasets: [
      {
        label: '缺口次數',
        data: ranking.map(item => item.count),
        backgroundColor: 'rgba(239, 68, 68, 0.7)',
        borderRadius: 8,
      },
    ],
  };
  const options = {
    responsive: true,
    plugins: {
      legend: { display: false },
      title: { display: false },
      tooltip: { enabled: true },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { font: { size: 11 } },
      },
      y: {
        beginAtZero: true,
        grid: { color: '#f3f4f6' },
        ticks: { font: { size: 11 } },
      },
    },
  };
  return (
    <div style={{ maxWidth: 400, margin: '0 auto' }}>
      <Bar data={data} options={options} height={150} />
    </div>
  );
}

export function IntentPie({ ranking }: { ranking: { intent: string, count: number }[] }) {
  const data = {
    labels: ranking.map(item => item.intent),
    datasets: [
      {
        label: '缺口類別',
        data: ranking.map(item => item.count),
        backgroundColor: [
          '#f87171', '#60a5fa', '#fbbf24', '#34d399', '#a78bfa', '#f472b6', '#facc15', '#38bdf8', '#4ade80', '#f472b6', '#fcd34d', '#818cf8', '#fca5a5', '#a3e635', '#f9a8d4', '#f59e42', '#c084fc', '#fef08a', '#fca5a5', '#fbbf24', '#a3e635', '#818cf8', '#f472b6', '#f87171'
        ],
        borderWidth: 1,
      },
    ],
  };
  const options = {
    responsive: true,
    plugins: {
      legend: { position: 'bottom' as const, labels: { font: { size: 11 } } },
      tooltip: { enabled: true },
    },
  };
  return (
    <div style={{ maxWidth: 260, margin: '0 auto' }}>
      <Pie data={data} options={options} height={150} />
    </div>
  );
}
