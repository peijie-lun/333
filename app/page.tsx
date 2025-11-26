
'use client';

import { useState } from 'react';

export default function AdminDashboard() {
  // 公告狀態
  const [announceTitle, setAnnounceTitle] = useState('');
  const [announceContent, setAnnounceContent] = useState('');
  const [announceAuthor, setAnnounceAuthor] = useState('');
  const [announceLoading, setAnnounceLoading] = useState(false);
  const [announceMessage, setAnnounceMessage] = useState('');

  // 投票狀態
  const [voteTitle, setVoteTitle] = useState('');
  const [voteDescription, setVoteDescription] = useState('');
  const [voteAuthor, setVoteAuthor] = useState('');
  const [voteEndsAt, setVoteEndsAt] = useState('');
  const [voteLoading, setVoteLoading] = useState(false);
  const [voteMessage, setVoteMessage] = useState('');

  // 公告提交
  const handleAnnounceSubmit = async (e) => {
    e.preventDefault();
    setAnnounceLoading(true);
    setAnnounceMessage('');

    try {
      const res = await fetch('/api/announce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: announceTitle,
          content: announceContent,
          author: announceAuthor
        })
      });

      const data = await res.json();
      if (res.ok) {
        setAnnounceMessage('✅ 公告已發布並推播到 LINE Bot！');
        setAnnounceTitle('');
        setAnnounceContent('');
        setAnnounceAuthor('');
      } else {
        setAnnounceMessage(`❌ 錯誤：${data.error || '無法發布公告'}`);
      }
    } catch (err) {
      setAnnounceMessage(`❌ 系統錯誤：${err.message}`);
    } finally {
      setAnnounceLoading(false);
    }
  };

  // 投票提交
  const handleVoteSubmit = async (e) => {
    e.preventDefault();
    setVoteLoading(true);
    setVoteMessage('');

    try {
      const res = await fetch('/api/votes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: voteTitle,
          description: voteDescription,
          author: voteAuthor,
          ends_at: voteEndsAt
        })
      });

      const data = await res.json();
      if (res.ok) {
        setVoteMessage('✅ 投票已發布並推播到 LINE Bot！');
        setVoteTitle('');
        setVoteDescription('');
        setVoteAuthor('');
        setVoteEndsAt('');
      } else {
        setVoteMessage(`❌ 錯誤：${data.error || '無法發布投票'}`);
      }
    } catch (err) {
      setVoteMessage(`❌ 系統錯誤：${err.message}`);
    } finally {
      setVoteLoading(false);
    }
  };

  return (
    <main
      style={{
        padding: '40px 20px',
        maxWidth: '800px',
        margin: '50px auto',
        fontFamily: 'Arial, sans-serif'
      }}
    >
      {/* 公告區塊 */}
      <section
        style={{
          backgroundColor: '#fdfdfd',
          padding: '20px',
          borderRadius: '12px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
          marginBottom: '40px'
        }}
      >
        <h2 style={{ textAlign: 'center', marginBottom: '20px', color: '#333' }}>
          發布公告
        </h2>
        <form
          onSubmit={handleAnnounceSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}
        >
          <input
            type="text"
            placeholder="公告標題"
            value={announceTitle}
            onChange={(e) => setAnnounceTitle(e.target.value)}
            required
            style={{ padding: '12px', borderRadius: '8px', border: '1px solid #ccc' }}
          />
          <textarea
            placeholder="公告內容"
            value={announceContent}
            onChange={(e) => setAnnounceContent(e.target.value)}
            rows={4}
            required
            style={{ padding: '12px', borderRadius: '8px', border: '1px solid #ccc' }}
          />
          <input
            type="text"
            placeholder="發布者"
            value={announceAuthor}
            onChange={(e) => setAnnounceAuthor(e.target.value)}
            required
            style={{ padding: '12px', borderRadius: '8px', border: '1px solid #ccc' }}
          />
          <button
            type="submit"
            disabled={announceLoading}
            style={{
              padding: '12px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: '#2196F3',
              color: 'white',
              fontSize: '16px',
              fontWeight: 'bold',
              cursor: announceLoading ? 'not-allowed' : 'pointer'
            }}
          >
            {announceLoading ? '發布中...' : '儲存公告並推播'}
          </button>
        </form>
        {announceMessage && (
          <p style={{ marginTop: '15px', textAlign: 'center', color: announceMessage.includes('錯誤') ? 'red' : 'green' }}>
            {announceMessage}
          </p>
        )}
      </section>

      {/* 投票區塊 */}
      <section
        style={{
          backgroundColor: '#fdfdfd',
          padding: '20px',
          borderRadius: '12px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
        }}
      >
        <h2 style={{ textAlign: 'center', marginBottom: '20px', color: '#333' }}>
          新增投票
        </h2>
        <form
          onSubmit={handleVoteSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}
        >
          <input
            type="text"
            placeholder="投票標題"
            value={voteTitle}
            onChange={(e) => setVoteTitle(e.target.value)}
            required
            style={{ padding: '12px', borderRadius: '8px', border: '1px solid #ccc' }}
          />
          <textarea
            placeholder="投票說明"
            value={voteDescription}
            onChange={(e) => setVoteDescription(e.target.value)}
            rows={4}
            style={{ padding: '12px', borderRadius: '8px', border: '1px solid #ccc' }}
          />
          <input
            type="text"
            placeholder="發布者"
            value={voteAuthor}
            onChange={(e) => setVoteAuthor(e.target.value)}
            required
            style={{ padding: '12px', borderRadius: '8px', border: '1px solid #ccc' }}
          />
          <input
            type="datetime-local"
            placeholder="截止時間"
            value={voteEndsAt}
            onChange={(e) => setVoteEndsAt(e.target.value)}
            required
            style={{ padding: '12px', borderRadius: '8px', border: '1px solid #ccc' }}
          />
          <button
            type="submit"
            disabled={voteLoading}
            style={{
              padding: '12px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: '#4CAF50',
              color: 'white',
              fontSize: '16px',
              fontWeight: 'bold',
              cursor: voteLoading ? 'not-allowed' : 'pointer'
            }}
          >
            {voteLoading ? '發布中...' : '儲存投票並推播'}
          </button>
        </form>
        {voteMessage && (
          <p style={{ marginTop: '15px', textAlign: 'center', color: voteMessage.includes('錯誤') ? 'red' : 'green' }}>
            {voteMessage}
          </p>
        )}
      </section>
    </main>
  );
}