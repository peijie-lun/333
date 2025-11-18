'use client';

import { useState } from 'react';

export default function HomePage() {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [author, setAuthor] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const res = await fetch('/api/announce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, author })
      });

      const data = await res.json();
      if (res.ok) {
        setMessage('公告已發布並推播到 LINE Bot！');
        setTitle('');
        setContent('');
        setAuthor('');
      } else {
        setMessage(`錯誤：${data.error?.message || '無法發布公告'}`);
      }
    } catch (err) {
      setMessage(`系統錯誤：${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ padding: '20px', maxWidth: '600px', margin: 'auto' }}>
      <h1>發布最新公告</h1>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <input
          type="text"
          placeholder="公告標題"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <textarea
          placeholder="公告內容"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          required
          rows={4}
        />
        <input
          type="text"
          placeholder="發布者"
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          required
        />
        <button type="submit" disabled={loading}>
          {loading ? '發布中...' : '儲存公告並推播'}
        </button>
      </form>
      {message && <p style={{ marginTop: '10px', color: 'green' }}>{message}</p>}
    </main>
  );
}
