
import { supabase } from '../../../supabaseClient';

export async function POST(req) {
  const { visitorName, visitorPhone, purpose, reserveTime, unitId, reservedById } = await req.json();

  // 寫入 visitors 表，優先用前端傳入的 unitId、reservedById
  const { data, error } = await supabase
    .from('visitors')
    .insert([
      {
        name: visitorName,
        phone: visitorPhone,
        purpose: purpose,
        reservation_time: reserveTime,
        unit_id: unitId,
        reserved_by_id: reservedById,
      }
    ])
    .select();

  if (error) {
    return new Response('Insert failed', { status: 500 });
  }
  return new Response(JSON.stringify(data[0]), { status: 200 });
}
