'use client';

import { useState, useEffect } from 'react';

interface RepairRequest {
  id: number;
  repair_number: string; // 報修編號 R20260224-001
  user_id: string;
  user_name: string;
  building: string; // 棟別
  location: string;
  description: string;
  photo_url: string | null;
  status: 'pending' | 'processing' | 'completed' | 'cancelled';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  assigned_to: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export default function RepairManagementPage() {
  const [repairs, setRepairs] = useState<RepairRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [selectedRepair, setSelectedRepair] = useState<RepairRequest | null>(null);

  useEffect(() => {
    fetchRepairs();
  }, [filter]);

  const fetchRepairs = async () => {
    setLoading(true);
    try {
      const url = filter === 'all' 
        ? '/api/repairs?limit=100'
        : `/api/repairs?status=${filter}&limit=100`;
      
      const response = await fetch(url);
      const result = await response.json();
      
      if (result.success) {
        setRepairs(result.data);
      }
    } catch (error) {
      console.error('載入報修單失敗:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (repairId, newStatus) => {
    try {
      const response = await fetch('/api/repairs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: repairId, status: newStatus })
      });

      const result = await response.json();
      
      if (result.success) {
        alert('狀態更新成功！');
        fetchRepairs();
      }
    } catch (error) {
      console.error('更新失敗:', error);
      alert('更新失敗，請稍後再試');
    }
  };

  const updatePriority = async (repairId, newPriority) => {
    try {
      const response = await fetch('/api/repairs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: repairId, priority: newPriority })
      });

      if (response.ok) {
        alert('優先級更新成功！');
        fetchRepairs();
      }
    } catch (error) {
      console.error('更新失敗:', error);
    }
  };

  const statusColors = {
    pending: 'bg-yellow-100 text-yellow-800',
    processing: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    cancelled: 'bg-gray-100 text-gray-800'
  };

  const statusText = {
    pending: '待處理',
    processing: '處理中',
    completed: '已完成',
    cancelled: '已取消'
  };

  const priorityColors = {
    low: 'bg-gray-100 text-gray-600',
    normal: 'bg-blue-100 text-blue-600',
    high: 'bg-orange-100 text-orange-600',
    urgent: 'bg-red-100 text-red-600'
  };

  const priorityText = {
    low: '低',
    normal: '一般',
    high: '高',
    urgent: '緊急'
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl">載入中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">🔧 報修管理系統</h1>
          <p className="text-gray-600 mt-2">管理社區報修單</p>
        </div>

        {/* 篩選按鈕 */}
        <div className="mb-6 flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg ${filter === 'all' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700'}`}
          >
            全部 ({repairs.length})
          </button>
          <button
            onClick={() => setFilter('pending')}
            className={`px-4 py-2 rounded-lg ${filter === 'pending' ? 'bg-yellow-600 text-white' : 'bg-white text-gray-700'}`}
          >
            待處理
          </button>
          <button
            onClick={() => setFilter('processing')}
            className={`px-4 py-2 rounded-lg ${filter === 'processing' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700'}`}
          >
            處理中
          </button>
          <button
            onClick={() => setFilter('completed')}
            className={`px-4 py-2 rounded-lg ${filter === 'completed' ? 'bg-green-600 text-white' : 'bg-white text-gray-700'}`}
          >
            已完成
          </button>
        </div>

        {/* 報修單列表 */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">報修編號</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">棟別</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">地點</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">問題描述</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">報修人</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">優先級</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">狀態</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">建立時間</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {repairs.map((repair) => (
                <tr key={repair.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-blue-600">
                    {repair.repair_number || `#${repair.id}`}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {repair.building || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {repair.location}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                    {repair.description}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {repair.user_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <select
                      value={repair.priority}
                      onChange={(e) => updatePriority(repair.id, e.target.value)}
                      className={`px-2 py-1 rounded-full text-xs font-semibold ${priorityColors[repair.priority]}`}
                    >
                      <option value="low">低</option>
                      <option value="normal">一般</option>
                      <option value="high">高</option>
                      <option value="urgent">緊急</option>
                    </select>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${statusColors[repair.status]}`}>
                      {statusText[repair.status]}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(repair.created_at).toLocaleString('zh-TW')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <select
                      onChange={(e) => updateStatus(repair.id, e.target.value)}
                      className="border rounded px-2 py-1 text-sm"
                      defaultValue=""
                    >
                      <option value="" disabled>更新狀態</option>
                      <option value="pending">待處理</option>
                      <option value="processing">處理中</option>
                      <option value="completed">已完成</option>
                      <option value="cancelled">已取消</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {repairs.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              目前沒有報修單
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
