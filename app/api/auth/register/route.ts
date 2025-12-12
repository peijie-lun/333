import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  try {
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
    const { email, password, name } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ success: false, message: "Email 或密碼不可為空" }, { status: 400 });
    }

    // 建立使用者
    const { data, error } = await supabase
      .from("profiles")
      .insert([{ email, password, name }])
      .select()
      .single();

    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 400 });

    return NextResponse.json({ success: true, user: data });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
