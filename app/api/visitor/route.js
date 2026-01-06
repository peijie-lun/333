import { supabase } from '../../../supabaseClient';

export async function POST(req) {
  const { visitorName, visitorPhone, purpose, reserveTime } = await req.json();

  const { data, error } = await supabase
    .from('visitors')
    .insert([
      {
        name: visitorName,
        phone: visitorPhone,
        purpose: purpose,
        reservation_time: reserveTime,
        // 其他欄位可依需求補上
      }
    ])
    .select();

  if (error) {
    return new Response('Insert failed', { status: 500 });
  }
  return new Response(JSON.stringify(data[0]), { status: 200 });
}
