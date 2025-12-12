import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// 注意：檔案副檔名必須是 .ts，並放在 app/api/bind-line/route.ts
export async function POST(req: Request) {
  try {
    // 1️⃣ 初始化 Supabase client（API Route 專用）
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!
    );

    // 2️⃣ 解析前端傳來的資料
    const body = await req.json();
    const { line_user_id, line_display_name, line_avatar_url, line_status_message } = body;

    console.log("收到前端資料:", body);

    if (!line_user_id) {
      return NextResponse.json({ message: "缺少 LINE userId" }, { status: 400 });
    }

    // 3️⃣ 取得 profileId（這裡假設 line_user_id 為唯一識別，或可根據需求調整）
    const profileId = line_user_id;

    // 4️⃣ Upsert 資料到 profiles
    console.log("準備 upsert profiles，profileId:", profileId);

    const { data, error } = await supabase
      .from("profiles")
      .upsert({
        id: profileId,
        line_user_id: line_user_id,
        line_display_name: line_display_name || null,
        line_avatar_url: line_avatar_url || null,
        line_status_message: line_status_message || null,
        updated_at: new Date(),
      })
      .select();

    console.log("upsert 結果:", { data, error });

    if (error) {
      return NextResponse.json(
        { message: "資料庫更新失敗", error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "LINE 已成功綁定！",
      profile: data[0],
    });
  } catch (err: any) {
    console.error("伺服器錯誤:", err);
    return NextResponse.json(
      { message: "伺服器錯誤", error: err.message },
      { status: 500 }
    );
  }
}
