import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

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

    return Response.json({ success: true, data: data[0] });
  } catch (err) {
    console.error('PATCH /api/repairs 錯誤:', err);
    return Response.json({ error: '伺服器錯誤' }, { status: 500 });
  }
}

// POST - 管理員手動建立報修單
export async function POST(req) {
  try {
    const body = await req.json();
    const { user_id, user_name, repair_type, location, description, photo_url, priority } = body;

    if (!repair_type || !location || !description) {
      return Response.json({ error: '缺少必要欄位' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('repair_requests')
      .insert([{
        user_id: user_id || 'admin',
        user_name: user_name || '管理員',
        repair_type,
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
