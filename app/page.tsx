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
    <main
      style={{
        padding: '40px 20px',
        maxWidth: '600px',
        margin: '50px auto',
        fontFamily: 'Arial, sans-serif',
        backgroundColor: '#fdfdfd',
        borderRadius: '12px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
      }}
    >
      <h1 style={{ textAlign: 'center', marginBottom: '30px', color: '#333' }}>發布最新公告</h1>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        <input
          type="text"
          placeholder="公告標題"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          style={{
            padding: '12px 15px',
            borderRadius: '8px',
            border: '1px solid #ccc',
            fontSize: '16px'
          }}
        />
        <textarea
          placeholder="公告內容"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          required
          rows={5}
          style={{
            padding: '12px 15px',
            borderRadius: '8px',
            border: '1px solid #ccc',
            fontSize: '16px',
            resize: 'vertical'
          }}
        />
        <input
          type="text"
          placeholder="發布者"
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          required
          style={{
            padding: '12px 15px',
            borderRadius: '8px',
            border: '1px solid #ccc',
            fontSize: '16px'
          }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '12px',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: '#4CAF50',
            color: 'white',
            fontSize: '16px',
            fontWeight: 'bold',
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.3s'
          }}
          onMouseOver={(e) => {
            if (!loading) e.currentTarget.style.backgroundColor = '#45a049';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.backgroundColor = '#4CAF50';
          }}
        >
          {loading ? '發布中...' : '儲存公告並推播'}
        </button>
      </form>
      {message && (
        <p style={{ marginTop: '20px', textAlign: 'center', color: message.includes('錯誤') ? 'red' : 'green' }}>
          {message}
        </p>
      )}
    </main>
  );
}
