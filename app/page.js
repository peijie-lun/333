'use client';

import { useState } from 'react';

export default function HomePage() {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [author, setAuthor] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const res = await fetch('/api/announce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, author }),
      });

      const data = await res.json();
      if (res.ok) {
        setMessage('✅ 公告已發布並推播到 LINE Bot！');
        setTitle('');
        setContent('');
        setAuthor('');
      } else {
        setMessage(`❌ 錯誤：${data.error?.message || '無法發布公告'}`);
      }
    } catch (err: any) {
      setMessage(`❌ 系統錯誤：${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex justify-center items-center min-h-screen bg-gray-50 p-4">
      <div className="bg-white shadow-lg rounded-2xl p-8 w-full max-w-md">
        <h1 className="text-2xl font-bold mb-6 text-center text-gray-800">
          發布最新公告
        </h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="text"
            placeholder="公告標題"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
          />
          <textarea
            placeholder="公告內容"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            required
            rows={4}
            className="border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 transition resize-none"
          />
          <input
            type="text"
            placeholder="發布者"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            required
            className="border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
          />
          <button
            type="submit"
            disabled={loading}
            className={`bg-blue-500 text-white font-semibold py-2 rounded-lg hover:bg-blue-600 transition ${
              loading ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {loading ? '發布中...' : '儲存公告並推播'}
          </button>
        </form>
        {message && (
          <p
            className={`mt-4 text-center font-medium ${
              message.startsWith('✅') ? 'text-green-600' : 'text-red-600'
            }`}
          >
            {message}
          </p>
        )}
      </div>
    </main>
  );
}
