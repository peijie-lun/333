"use client";

import { useState } from 'react';


export default function Page() {
  // 預約欄位
  const [visitorName, setVisitorName] = useState('');
  const [visitorPhone, setVisitorPhone] = useState('');
  const [purpose, setPurpose] = useState('');
  const [reserveTime, setReserveTime] = useState('');
  const [residentName, setResidentName] = useState('');
  const [unitId, setUnitId] = useState('');
  const [reservedById, setReservedById] = useState('');
  const [result, setResult] = useState('');
  // 根據住戶名稱查 profile
  const handleResidentNameBlur = async () => {
    if (!residentName) return;
    try {
      const res = await fetch('/api/profile-by-name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: residentName }),
      });
      if (res.ok) {
        const profile = await res.json();
        setUnitId(profile.unit_id || '');
        setReservedById(profile.id || '');
      } else {
        setUnitId('');
        setReservedById('');
      }
    } catch {
      setUnitId('');
      setReservedById('');
    }
  };

  // 警衛簽到/簽退欄位
  const [signName, setSignName] = useState('');
  const [signResult, setSignResult] = useState('');

  // 預約送出
  const handleReserve = async () => {
    if (!visitorName || !visitorPhone || !purpose || !reserveTime) {
      setResult('請完整填寫所有欄位');
      return;
    }

    try {
      // 先存進 supabase visitors 表
      const visitorRes = await fetch('/api/visitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visitorName,
          visitorPhone,
          purpose,
          reserveTime,
          unitId,
          reservedById,
        }),
      });
      if (!visitorRes.ok) {
        setResult('預約失敗，請稍後再試');
        return;
      }
      const visitorData = await visitorRes.json();

      // 再推播
      const response = await fetch('/api/line-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'reservation',
          visitorName,
          time: reserveTime,
          visitorId: visitorData.id,
        }),
      });

      if (response.ok) {
        setResult(`預約成功！\n姓名：${visitorName}\n電話：${visitorPhone}\n目的：${purpose}\n時間：${reserveTime}`);
        setVisitorName('');
        setVisitorPhone('');
        setPurpose('');
        setReserveTime('');
      } else {
        const errorText = await response.text();
        console.error('Line Notify response:', errorText);
        setResult(`預約成功，但通知發送失敗\n${errorText}`);
      }
    } catch (error) {
      console.error('Error sending reservation notification:', error);
      setResult('預約失敗，請稍後再試');
    }
  };

  // 警衛簽到/簽退
  const handleAction = async (action: 'checkin' | 'checkout') => {
    if (!signName) {
      setSignResult('請輸入訪客姓名');
      return;
    }

    try {
      const response = await fetch('/api/line-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: action,
          visitorName: signName,
          time: new Date().toLocaleTimeString(),
          location: '社區管理室',
        }),
      });

      if (response.ok) {
        setSignResult(`已${action === 'checkin' ? '簽到' : '簽退'}：${signName}`);
        setSignName('');
      } else {
        setSignResult('操作成功，但通知發送失敗');
      }
    } catch (error) {
      console.error('Error sending checkin/checkout notification:', error);
      setSignResult('操作失敗，請稍後再試');
    }
  };

  return (
    <div style={{ maxWidth: 420, margin: '40px auto', padding: 24, border: '1px solid #ccc', borderRadius: 8 }}>
      <h2>住戶預約訪客</h2>
      <input
        type="text"
        placeholder="訪客姓名"
        value={visitorName}
        onChange={e => setVisitorName(e.target.value)}
        style={{ width: '100%', padding: 8, marginBottom: 8 }}
      />
      <input
        type="tel"
        placeholder="訪客電話"
        value={visitorPhone}
        onChange={e => setVisitorPhone(e.target.value)}
        style={{ width: '100%', padding: 8, marginBottom: 8 }}
      />
      <input
        type="text"
        placeholder="來訪目的"
        value={purpose}
        onChange={e => setPurpose(e.target.value)}
        style={{ width: '100%', padding: 8, marginBottom: 8 }}
      />
      <input
        type="text"
        placeholder="住戶名稱"
        value={residentName}
        onChange={e => setResidentName(e.target.value)}
        onBlur={handleResidentNameBlur}
        style={{ width: '100%', padding: 8, marginBottom: 8 }}
      />
      <input
        type="datetime-local"
        placeholder="預約時間"
        value={reserveTime}
        onChange={e => setReserveTime(e.target.value)}
        style={{ width: '100%', padding: 8, marginBottom: 12 }}
      />
      <button onClick={handleReserve} style={{ width: '100%', padding: 10, background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4, marginBottom: 12 }}>確認預約</button>
      {result && <div style={{ color: 'green', whiteSpace: 'pre-line', marginBottom: 24 }}>{result}</div>}

      <hr style={{ margin: '32px 0' }} />
      <h2>警衛簽到/簽退</h2>
      <input
        type="text"
        placeholder="請輸入訪客姓名"
        value={signName}
        onChange={e => setSignName(e.target.value)}
        style={{ width: '100%', padding: 8, marginBottom: 12 }}
      />
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button onClick={() => handleAction('checkin')} style={{ flex: 1, padding: 8 }}>簽到</button>
        <button onClick={() => handleAction('checkout')} style={{ flex: 1, padding: 8 }}>簽退</button>
      </div>
      {signResult && <div style={{ color: 'green' }}>{signResult}</div>}
    </div>
  );
}
