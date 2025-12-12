import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  try {
    // 1️⃣ 初始化 Supabase client
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!
    );

    // 2️⃣ 解析前端傳來的資料
    const body = await req.json();
    const { profile_id, line_user_id, line_display_name, line_avatar_url, line_status_message } = body;

    console.log("收到前端資料:", body);

    if (!profile_id || !line_user_id) {
      return NextResponse.json(
        { success: false, message: "缺少 profile_id 或 LINE userId" },
        { status: 400 }
      );
    }

    // 3️⃣ 更新指定 profile
    const { data, error } = await supabase
      .from("profiles")
      .update({
        line_user_id,
        line_display_name: line_display_name || null,
        line_avatar_url: line_avatar_url || null,
        line_status_message: line_status_message || null,
        updated_at: new Date(),
      })
      .eq("id", profile_id)
      .select()
      .single(); // 回傳更新後資料

    if (error) {
      console.error("資料庫更新失敗:", error);
      return NextResponse.json(
        { success: false, message: "資料庫更新失敗", error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "LINE 已成功綁定！",
      profile: data,
    });
  } catch (err: any) {
    console.error("伺服器錯誤:", err);
    return NextResponse.json(
      { success: false, message: "伺服器錯誤", error: err.message },
      { status: 500 }
    );
  }
}
