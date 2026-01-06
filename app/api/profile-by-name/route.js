import { supabase } from '../../../supabaseClient';

export async function POST(req) {
  const { name } = await req.json();
  if (!name) {
    return new Response('No name provided', { status: 400 });
  }
  const { data, error } = await supabase
    .from('profiles')
    .select('id, unit_id')
    .eq('name', name)
    .single();
  if (error || !data) {
    return new Response('Profile not found', { status: 404 });
  }
  return new Response(JSON.stringify(data), { status: 200 });
}
