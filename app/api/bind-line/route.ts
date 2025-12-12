import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

// 注意：檔案副檔名必須是 .ts，並放在 app/api/bind-line/route.ts
export async function POST(req: Request) {
  try {
    // 1️⃣ 初始化 Supabase client（App Router 專用）
    const supabase = createRouteHandlerClient({ cookies });

    // 2️⃣ 解析前端傳來的資料
    const body = await req.json();
    const { line_user_id, line_display_name, line_avatar_url, line_status_message } = body;

    console.log("收到前端資料:", body);

    if (!line_user_id) {
      return NextResponse.json({ message: "缺少 LINE userId" }, { status: 400 });
    }

    // 3️⃣ 取得目前登入的 Supabase 使用者
    const { data: userData, error: authError } = await supabase.auth.getUser();
    console.log("Supabase auth.getUser() 回傳:", userData, authError);

    const user = userData?.user;

    if (authError || !user) {
      return NextResponse.json(
        { message: "使用者未登入", error: authError?.message || "user 為 null" },
        { status: 401 }
      );
    }

    const profileId = user.id;

    // 4️⃣ Upsert 資料到 profiles
    console.log("準備 upsert profiles，profileId:", profileId);

    const { data, error } = await supabase
      .from("profiles")
      .upsert({
        id: profileId,
        line_user_id,
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
