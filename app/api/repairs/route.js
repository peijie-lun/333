import { createClient } from '@supabase/supabase-js';
import { Client } from '@line/bot-sdk';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// LINE Bot SDK 客戶端
const lineClient = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
});

export const runtime = 'nodejs';

// GET - 查詢報修單列表
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status'); // pending/processing/completed/cancelled
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const repairId = searchParams.get('id'); // 查詢特定報修單

    // 查詢單一報修單詳情
    if (repairId) {
      const { data, error } = await supabase
        .from('repair_requests')
        .select('*')
        .eq('id', repairId)
        .single();

      if (error) {
        return Response.json({ error: error.message }, { status: 400 });
      }

      return Response.json({ success: true, data });
    }

    // 查詢報修單列表
    let query = supabase
      .from('repair_requests')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error, count } = await query;

    if (error) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    return Response.json({
      success: true,
      data,
      pagination: {
        total: count,
        limit,
        offset,
        hasMore: count > offset + limit
      }
    });
  } catch (err) {
    console.error('GET /api/repairs 錯誤:', err);
    return Response.json({ error: '伺服器錯誤' }, { status: 500 });
  }
}

// PATCH - 更新報修單狀態
export async function PATCH(req) {
  try {
    const body = await req.json();
    const { id, status, priority, assigned_to, notes } = body;

    if (!id) {
      return Response.json({ error: '缺少報修單 ID' }, { status: 400 });
    }

    // 先獲取當前報修單資訊（用於比對狀態變更和推播通知）
    const { data: currentRepair } = await supabase
      .from('repair_requests')
      .select('*')
      .eq('id', id)
      .single();

    if (!currentRepair) {
      return Response.json({ error: '找不到報修單' }, { status: 404 });
    }

    const updateData = {
      updated_at: new Date().toISOString()
    };

    if (status) {
      updateData.status = status;
      if (status === 'completed') {
        updateData.completed_at = new Date().toISOString();
      }
    }
    if (priority) updateData.priority = priority;
    if (assigned_to !== undefined) updateData.assigned_to = assigned_to;
    if (notes !== undefined) updateData.notes = notes;

    const { data, error } = await supabase
      .from('repair_requests')
      .update(updateData)
      .eq('id', id)
      .select();

    if (error) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    const updatedRepair = data[0];

    // ===== 狀態變更推播通知 =====
    if (status && status !== currentRepair.status) {
      try {
        const statusEmoji = {
          'pending': '🟡',
          'processing': '🔵',
          'completed': '✅',
          'cancelled': '❌'
        };

        const statusText = {
          'pending': '待處理',
          'processing': '處理中',
          'completed': '已完成',
          'cancelled': '已取消'
        };

        let notificationText = '';

        if (status === 'processing') {
          notificationText = `🔔 報修狀態更新\n\n您的報修 ${updatedRepair.repair_number}\n${statusEmoji[status]} 目前狀態：${statusText[status]}\n\n我們正在處理您的報修，請稍候。`;
        } else if (status === 'completed') {
          notificationText = `✅ 您的報修已完成\n\n報修編號：${updatedRepair.repair_number}\n感謝您的通報\n\n如有任何問題，歡迎再次聯繫我們。`;
        } else if (status === 'cancelled') {
          notificationText = `❌ 報修已取消\n\n報修編號：${updatedRepair.repair_number}\n${notes ? '\n備註：' + notes : ''}`;
        } else {
          notificationText = `🔔 報修狀態更新\n\n您的報修 ${updatedRepair.repair_number}\n${statusEmoji[status]} 目前狀態：${statusText[status]}`;
        }

        // 推播通知給報修的使用者
        await lineClient.pushMessage(currentRepair.user_id, {
          type: 'text',
          text: notificationText
        });

        console.log(`[報修通知] 已推播給 ${currentRepair.user_id}，狀態：${status}`);
      } catch (pushError) {
        console.error('[報修通知] 推播失敗:', pushError);
        // 推播失敗不影響狀態更新，所以不回傳錯誤
      }
    }

    return Response.json({ success: true, data: updatedRepair });
  } catch (err) {
    console.error('PATCH /api/repairs 錯誤:', err);
    return Response.json({ error: '伺服器錯誤' }, { status: 500 });
  }
}

// POST - 管理員手動建立報修單
export async function POST(req) {
  try {
    const body = await req.json();
    const { user_id, user_name, building, location, description, photo_url, priority } = body;

    if (!location || !description) {
      return Response.json({ error: '缺少必要欄位' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('repair_requests')
      .insert([{
        user_id: user_id || 'admin',
        user_name: user_name || '管理員',
        building: building || null,
        location,
        description,
        photo_url: photo_url || null,
        priority: priority || 'normal',
        status: 'pending',
        created_at: new Date().toISOString()
      }])
      .select();

    if (error) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    return Response.json({ success: true, data: data[0] }, { status: 201 });
  } catch (err) {
    console.error('POST /api/repairs 錯誤:', err);
    return Response.json({ error: '伺服器錯誤' }, { status: 500 });
  }
}

// DELETE - 刪除報修單（管理員功能）
export async function DELETE(req) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return Response.json({ error: '缺少報修單 ID' }, { status: 400 });
    }

    const { error } = await supabase
      .from('repair_requests')
      .delete()
      .eq('id', id);

    if (error) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    return Response.json({ success: true, message: '報修單已刪除' });
  } catch (err) {
    console.error('DELETE /api/repairs 錯誤:', err);
    return Response.json({ error: '伺服器錯誤' }, { status: 500 });
  }
}
