'use client';

import { useState } from 'react';

// 催繳按鈕組件
function RemindButton({ feeId, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const remind = async () => {
    setLoading(true);
    setMsg(null);
    try {
      const resp = await fetch('/api/remind-fee', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': process.env.NEXT_PUBLIC_ADMIN_API_KEY || '',
        },
        body: JSON.stringify({ feeId }),
      });
      const data = await resp.json();
      if (resp.ok) {
        setMsg('已送出催繳訊息');
        if (onSuccess) onSuccess();
      } else {
        setMsg(`失敗：${data.error}`);
      }
    } catch (e) {
      setMsg(`例外：${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
      <button 
        onClick={remind} 
        disabled={loading}
        style={{
          padding: '8px 16px',
          borderRadius: '6px',
          border: 'none',
          backgroundColor: loading ? '#ccc' : '#FF5722',
          color: 'white',
          fontSize: '14px',
          fontWeight: 'bold',
          cursor: loading ? 'not-allowed' : 'pointer'
        }}
      >
        {loading ? '送出中…' : '催繳'}
      </button>
      {msg && (
        <small style={{ 
          color: msg.includes('失敗') || msg.includes('例外') ? 'red' : 'green',
          fontSize: '12px'
        }}>
          {msg}
        </small>
      )}
    </div>
  );
}

// 包裹推播按鈕組件（同時存資料庫並推播給使用者）
function PackagePushButton({ onPush }) {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // 新增表單欄位
  const [courier, setCourier] = useState('');
  const [recipient, setRecipient] = useState('');
  const [room, setRoom] = useState('');
  const [tracking, setTracking] = useState('');
  const [arrivedAt, setArrivedAt] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      const resp = await fetch('/api/packages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': process.env.NEXT_PUBLIC_ADMIN_API_KEY || '',
        },
        body: JSON.stringify({
          courier,
          recipient_name: recipient,
          recipient_room: room,
          tracking_number: tracking,
          arrived_at: arrivedAt
        })
      });
      const data = await resp.json();
      if (resp.ok) {
        setMsg('✅ 包裹已新增並推播給住戶！');
        setCourier(''); setRecipient(''); setRoom(''); setTracking(''); setArrivedAt('');
        if (onPush) onPush();
      } else {
        setMsg(`❌ 推播失敗：${data.error}`);
      }
    } catch (e) {
      setMsg(`❌ 系統錯誤：${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-start' }}>
      <input type="text" placeholder="快遞公司" value={courier} onChange={e => setCourier(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #ccc', width: '100%' }} required />
      <input type="text" placeholder="收件人" value={recipient} onChange={e => setRecipient(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #ccc', width: '100%' }} required />
      <input type="text" placeholder="房號" value={room} onChange={e => setRoom(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #ccc', width: '100%' }} required />
      <input type="text" placeholder="追蹤號碼" value={tracking} onChange={e => setTracking(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #ccc', width: '100%' }} />
      <input type="datetime-local" placeholder="到達時間" value={arrivedAt} onChange={e => setArrivedAt(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #ccc', width: '100%' }} required />
      <button type="submit" disabled={loading} style={{
        padding: '8px 16px',
        borderRadius: '6px',
        border: 'none',
        backgroundColor: loading ? '#ccc' : '#9C27B0',
        color: 'white',
        fontSize: '14px',
        fontWeight: 'bold',
        cursor: loading ? 'not-allowed' : 'pointer',
        width: '100%'
      }}>
        {loading ? '推播中…' : '儲存並推播包裹'}
      </button>
      {msg && (
        <small style={{ color: msg.includes('失敗') || msg.includes('錯誤') ? 'red' : 'green', fontSize: '12px' }}>{msg}</small>
      )}
    </form>
  );
}

export default function AdminDashboard() {
  // 公告狀態
  const [announceTitle, setAnnounceTitle] = useState('');
  const [announceContent, setAnnounceContent] = useState('');
  const [announceAuthor, setAnnounceAuthor] = useState('');
  const [announceLoading, setAnnounceLoading] = useState(false);
  const [announceMessage, setAnnounceMessage] = useState('');

  // 投票狀態（簡化為標題、截止時間、Google Form 網址）
  const [voteTitle, setVoteTitle] = useState('');
  const [voteEndsAt, setVoteEndsAt] = useState('');
  const [voteFormUrl, setVoteFormUrl] = useState('');
  const [voteLoading, setVoteLoading] = useState(false);
  const [voteMessage, setVoteMessage] = useState('');

  // 管理費狀態
  const [feeRoom, setFeeRoom] = useState('');
  const [feeAmount, setFeeAmount] = useState('');
  const [feeDue, setFeeDue] = useState('');
  const [feeInvoice, setFeeInvoice] = useState('');
  const [feeLoading, setFeeLoading] = useState(false);
  const [feeMessage, setFeeMessage] = useState('');
  const [lastCreatedFeeId, setLastCreatedFeeId] = useState(null);

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

  // 投票（問卷）提交
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
          ends_at: voteEndsAt,
          form_url: voteFormUrl
        })
      });
      const data = await res.json();
      if (res.ok) {
        setVoteMessage('✅ 問卷連結已通知 LINE Bot！');
        setVoteTitle(''); setVoteEndsAt(''); setVoteFormUrl('');
      } else {
        setVoteMessage(`❌ 錯誤：${data.error || '無法發送問卷連結'}`);
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
    setLastCreatedFeeId(null);
    try {
      const res = await fetch('/api/fees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room: feeRoom, amount: parseFloat(feeAmount), due: feeDue, invoice: feeInvoice })
      });
      const data = await res.json();
      if (res.ok) {
        setFeeMessage('✅ 管理費已新增並推播到 LINE Bot！');
        setLastCreatedFeeId(data.id || data.feeId); // 保存新建的管理費ID
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

  return (
    <main style={{ padding: '40px 20px', maxWidth: '900px', margin: '50px auto', fontFamily: 'Arial, sans-serif' }}>
      {/* 公告 */}
      <section style={{
        backgroundColor: '#fff',
        padding: '20px',
        borderRadius: '12px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
        marginBottom: '40px'
      }}>
        <h2 style={{ textAlign: 'center', marginBottom: '20px', color: '#333' }}>發布公告</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <input type="text" placeholder="公告標題" value={announceTitle} onChange={(e) => setAnnounceTitle(e.target.value)} style={{
            padding: '12px',
            borderRadius: '8px',
            border: '1px solid #ccc',
            width: '100%'
          }} />
          <textarea placeholder="公告內容" value={announceContent} onChange={(e) => setAnnounceContent(e.target.value)} rows={4} style={{
            padding: '12px',
            borderRadius: '8px',
            border: '1px solid #ccc',
            width: '100%'
          }} />
          <input type="text" placeholder="發布者" value={announceAuthor} onChange={(e) => setAnnounceAuthor(e.target.value)} style={{
            padding: '12px',
            borderRadius: '8px',
            border: '1px solid #ccc',
            width: '100%'
          }} />
          <button onClick={handleAnnounceSubmit} disabled={announceLoading} style={{
            padding: '12px',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: announceLoading ? '#ccc' : '#2196F3',
            color: 'white',
            fontSize: '16px',
            fontWeight: 'bold',
            cursor: 'pointer',
            width: '100%'
          }}>{announceLoading ? '發布中...' : '儲存公告並推播'}</button>
        </div>
        {announceMessage && <p style={{ marginTop: '15px', textAlign: 'center', color: announceMessage.includes('錯誤') ? 'red' : 'green' }}>{announceMessage}</p>}
      </section>

      {/* 問卷（投票） */}
      <section style={{
        backgroundColor: '#fff',
        padding: '20px',
        borderRadius: '12px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
        marginBottom: '40px'
      }}>
        <h2 style={{ textAlign: 'center', marginBottom: '20px', color: '#333' }}>發起問卷連結通知</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <input type="text" placeholder="問卷標題" value={voteTitle} onChange={(e) => setVoteTitle(e.target.value)} style={{
            padding: '12px',
            borderRadius: '8px',
            border: '1px solid #ccc',
            width: '100%'
          }} />
          <input type="datetime-local" placeholder="截止時間" value={voteEndsAt} onChange={(e) => setVoteEndsAt(e.target.value)} style={{
            padding: '12px',
            borderRadius: '8px',
            border: '1px solid #ccc',
            width: '100%'
          }} />
          <input type="url" placeholder="Google Form 網址" value={voteFormUrl} onChange={(e) => setVoteFormUrl(e.target.value)} style={{
            padding: '12px',
            borderRadius: '8px',
            border: '1px solid #ccc',
            width: '100%'
          }} />
          <button onClick={handleVoteSubmit} disabled={voteLoading} style={{
            padding: '12px',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: voteLoading ? '#ccc' : '#4CAF50',
            color: 'white',
            fontSize: '16px',
            fontWeight: 'bold',
            cursor: 'pointer',
            width: '100%'
          }}>{voteLoading ? '通知中...' : '發起問卷連結通知'}</button>
        </div>
        {voteMessage && <p style={{ marginTop: '15px', textAlign: 'center', color: voteMessage.includes('錯誤') ? 'red' : 'green' }}>{voteMessage}</p>}
      </section>

      {/* 管理費 */}
      <section style={{
        backgroundColor: '#fff',
        padding: '20px',
        borderRadius: '12px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
        marginBottom: '40px'
      }}>
        <h2 style={{ textAlign: 'center', marginBottom: '20px', color: '#333' }}>新增管理費</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <input type="text" placeholder="房號" value={feeRoom} onChange={(e) => setFeeRoom(e.target.value)} style={{
            padding: '12px',
            borderRadius: '8px',
            border: '1px solid #ccc',
            width: '100%'
          }} />
          <input type="number" placeholder="金額" value={feeAmount} onChange={(e) => setFeeAmount(e.target.value)} style={{
            padding: '12px',
            borderRadius: '8px',
            border: '1px solid #ccc',
            width: '100%'
          }} />
          <input type="date" placeholder="到期日" value={feeDue} onChange={(e) => setFeeDue(e.target.value)} style={{
            padding: '12px',
            borderRadius: '8px',
            border: '1px solid #ccc',
            width: '100%'
          }} />
          <input type="text" placeholder="發票號碼" value={feeInvoice} onChange={(e) => setFeeInvoice(e.target.value)} style={{
            padding: '12px',
            borderRadius: '8px',
            border: '1px solid #ccc',
            width: '100%'
          }} />
          <button onClick={handleFeeSubmit} disabled={feeLoading} style={{
            padding: '12px',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: feeLoading ? '#ccc' : '#FF9800',
            color: 'white',
            fontSize: '16px',
            fontWeight: 'bold',
            cursor: 'pointer',
            width: '100%'
          }}>{feeLoading ? '新增中...' : '儲存管理費並推播'}</button>
        </div>
        {feeMessage && (
          <div style={{ marginTop: '15px', textAlign: 'center' }}>
            <p style={{ color: feeMessage.includes('錯誤') ? 'red' : 'green', marginBottom: '10px' }}>{feeMessage}</p>
            {lastCreatedFeeId && (
              <div style={{ marginTop: '10px' }}>
                <p style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>需要催繳此筆管理費嗎?</p>
                <RemindButton 
                  feeId={lastCreatedFeeId} 
                  onSuccess={() => setLastCreatedFeeId(null)}
                />
              </div>
            )}
          </div>
        )}
      </section>

      {/* 包裹推播 */}
      <section style={{
        backgroundColor: '#fff',
        padding: '20px',
        borderRadius: '12px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
        marginBottom: '40px'
      }}>
        <h2 style={{ textAlign: 'center', marginBottom: '20px', color: '#333' }}>推播包裹通知</h2>
        <PackagePushButton />
      </section>
    </main>
  );
}