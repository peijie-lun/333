
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

  // 管理費狀態
  const [feeRoom, setFeeRoom] = useState('');
  const [feeAmount, setFeeAmount] = useState('');
  const [feeDue, setFeeDue] = useState('');
  const [feeInvoice, setFeeInvoice] = useState('');
  const [feeLoading, setFeeLoading] = useState(false);
  const [feeMessage, setFeeMessage] = useState('');

  // 包裹管理狀態
  const [pkgCourier, setPkgCourier] = useState('');
  const [pkgRecipient, setPkgRecipient] = useState('');
  const [pkgRoom, setPkgRoom] = useState('');
  const [pkgTracking, setPkgTracking] = useState('');
  const [pkgArrivedAt, setPkgArrivedAt] = useState('');
  const [pkgLoading, setPkgLoading] = useState(false);
  const [pkgMessage, setPkgMessage] = useState('');

  // 公告提交
  const handleAnnounceSubmit = async (e) => {
    e.preventDefault();
    setAnnounceLoading(true);
    setAnnounceMessage('');
    try {
      const res = await fetch('/api/announce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: announceTitle, content: announceContent, author: announceAuthor })
      });
      const data = await res.json();           
      if (res.ok) {
        setAnnounceMessage('✅ 公告已發布並推播到 LINE Bot！');
        setAnnounceTitle(''); setAnnounceContent(''); setAnnounceAuthor('');
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
        body: JSON.stringify({ title: voteTitle, description: voteDescription, author: voteAuthor, ends_at: voteEndsAt })
      });
      const data = await res.json();
      if (res.ok) {
        setVoteMessage('✅ 投票已發布並推播到 LINE Bot！');
        setVoteTitle(''); setVoteDescription(''); setVoteAuthor(''); setVoteEndsAt('');
      } else {
        setVoteMessage(`❌ 錯誤：${data.error || '無法發布投票'}`);
      }
    } catch (err) {
      setVoteMessage(`❌ 系統錯誤：${err.message}`);
    } finally {
      setVoteLoading(false);
    }
  };

  // 管理費提交
  const handleFeeSubmit = async (e) => {
    e.preventDefault();
    setFeeLoading(true);
    setFeeMessage('');
    try {
      const res = await fetch('/api/fees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room: feeRoom, amount: parseFloat(feeAmount), due: feeDue, invoice: feeInvoice })
      });
      const data = await res.json();
      if (res.ok) {
        setFeeMessage('✅ 管理費已新增並推播到 LINE Bot！');
        setFeeRoom(''); setFeeAmount(''); setFeeDue(''); setFeeInvoice('');
      } else {
        setFeeMessage(`❌ 錯誤：${data.error || '無法新增管理費'}`);
      }
    } catch (err) {
      setFeeMessage(`❌ 系統錯誤：${err.message}`);
    } finally {
      setFeeLoading(false);
    }
  };

  // 包裹提交
  const handlePackageSubmit = async (e) => {
    e.preventDefault();
    setPkgLoading(true);
    setPkgMessage('');
    try {
      const res = await fetch('/api/packages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courier: pkgCourier,
          recipient_name: pkgRecipient,
          recipient_room: pkgRoom,
          tracking_number: pkgTracking,
          arrived_at: pkgArrivedAt
        })
      });
      const data = await res.json();
      if (res.ok) {
        setPkgMessage('✅ 包裹已新增並推播到 LINE Bot！');
        setPkgCourier(''); setPkgRecipient(''); setPkgRoom(''); setPkgTracking(''); setPkgArrivedAt('');
      } else {
        setPkgMessage(`❌ 錯誤：${data.error || '無法新增包裹'}`);
      }
    } catch (err) {
      setPkgMessage(`❌ 系統錯誤：${err.message}`);
    } finally {
      setPkgLoading(false);
    }
  };

  const cardStyle = {
    backgroundColor: '#fff',
    padding: '20px',
    borderRadius: '12px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
    marginBottom: '40px'
  };

  const inputStyle = {
    padding: '12px',
    borderRadius: '8px',
    border: '1px solid #ccc'
  };

  const buttonStyle = (color) => ({
    padding: '12px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: color,
    color: 'white',
    fontSize: '16px',
    fontWeight: 'bold',
    cursor: 'pointer'
  });

  return (
    <main style={{ padding: '40px 20px', maxWidth: '900px', margin: '50px auto', fontFamily: 'Arial, sans-serif' }}>
      {/* 公告 */}
      <section style={cardStyle}>
        <h2 style={{ textAlign: 'center', marginBottom: '20px', color: '#333' }}>發布公告</h2>
        <form onSubmit={handleAnnounceSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <input type="text" placeholder="公告標題" value={announceTitle} onChange={(e) => setAnnounceTitle(e.target.value)} required style={inputStyle} />
          <textarea placeholder="公告內容" value={announceContent} onChange={(e) => setAnnounceContent(e.target.value)} rows={4} required style={inputStyle} />
          <input type="text" placeholder="發布者" value={announceAuthor} onChange={(e) => setAnnounceAuthor(e.target.value)} required style={inputStyle} />
          <button type="submit" disabled={announceLoading} style={buttonStyle('#2196F3')}>{announceLoading ? '發布中...' : '儲存公告並推播'}</button>
        </form>
        {announceMessage && <p style={{ marginTop: '15px', textAlign: 'center', color: announceMessage.includes('錯誤') ? 'red' : 'green' }}>{announceMessage}</p>}
      </section>

      {/* 投票 */}
      <section style={cardStyle}>
        <h2 style={{ textAlign: 'center', marginBottom: '20px', color: '#333' }}>新增投票</h2>
        <form onSubmit={handleVoteSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <input type="text" placeholder="投票標題" value={voteTitle} onChange={(e) => setVoteTitle(e.target.value)} required style={inputStyle} />
          <textarea placeholder="投票說明" value={voteDescription} onChange={(e) => setVoteDescription(e.target.value)} rows={4} style={inputStyle} />
          <input type="text" placeholder="發布者" value={voteAuthor} onChange={(e) => setVoteAuthor(e.target.value)} required style={inputStyle} />
          <input type="datetime-local" placeholder="截止時間" value={voteEndsAt} onChange={(e) => setVoteEndsAt(e.target.value)} required style={inputStyle} />
          <button type="submit" disabled={voteLoading} style={buttonStyle('#4CAF50')}>{voteLoading ? '發布中...' : '儲存投票並推播'}</button>
        </form>
        {voteMessage && <p style={{ marginTop: '15px', textAlign: 'center', color: voteMessage.includes('錯誤') ? 'red' : 'green' }}>{voteMessage}</p>}
      </section>

      {/* 管理費 */}
      <section style={cardStyle}>
        <h2 style={{ textAlign: 'center', marginBottom: '20px', color: '#333' }}>新增管理費</h2>
        <form onSubmit={handleFeeSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <input type="text" placeholder="房號" value={feeRoom} onChange={(e) => setFeeRoom(e.target.value)} required style={inputStyle} />
          <input type="number" placeholder="金額" value={feeAmount} onChange={(e) => setFeeAmount(e.target.value)} required style={inputStyle} />
          <input type="date" placeholder="到期日" value={feeDue} onChange={(e) => setFeeDue(e.target.value)} required style={inputStyle} />
          <input type="text" placeholder="發票號碼" value={feeInvoice} onChange={(e) => setFeeInvoice(e.target.value)} style={inputStyle} />
          <button type="submit" disabled={feeLoading} style={buttonStyle('#FF9800')}>{feeLoading ? '新增中...' : '儲存管理費並推播'}</button>
        </form>
        {feeMessage && <p style={{ marginTop: '15px', textAlign: 'center', color: feeMessage.includes('錯誤') ? 'red' : 'green' }}>{feeMessage}</p>}
      </section>

      {/* 包裹管理 */}
      <section style={cardStyle}>
        <h2 style={{ textAlign: 'center', marginBottom: '20px', color: '#333' }}>新增包裹</h2>
        <form onSubmit={handlePackageSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <input type="text" placeholder="快遞公司" value={pkgCourier} onChange={(e) => setPkgCourier(e.target.value)} required style={inputStyle} />
          <input type="text" placeholder="收件人" value={pkgRecipient} onChange={(e) => setPkgRecipient(e.target.value)} required style={inputStyle} />
          <input type="text" placeholder="房號" value={pkgRoom} onChange={(e) => setPkgRoom(e.target.value)} required style={inputStyle} />
          <input type="text" placeholder="追蹤號碼" value={pkgTracking} onChange={(e) => setPkgTracking(e.target.value)} style={inputStyle} />
          <input type="datetime-local" placeholder="到達時間" value={pkgArrivedAt} onChange={(e) => setPkgArrivedAt(e.target.value)} required style={inputStyle} />
          <button type="submit" disabled={pkgLoading} style={buttonStyle('#9C27B0')}>{pkgLoading ? '新增中...' : '儲存包裹並推播'}</button>
        </form>
        {pkgMessage && <p style={{ marginTop: '15px', textAlign: 'center', color: pkgMessage.includes('錯誤') ? 'red' : 'green' }}>{pkgMessage}</p>}
      </section>
    </main>
  );
}
