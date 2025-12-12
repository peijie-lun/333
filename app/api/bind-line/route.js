import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(req) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    // 1️⃣ 解析前端傳來的資料
    const body = await req.json();
    const { userId, displayName, pictureUrl, statusMessage } = body;

    if (!userId) {
      return NextResponse.json(
        { message: "缺少 LINE userId" },
        { status: 400 }
      );
    }

    // 2️⃣ 從 Supabase Auth 取得目前登入使用者
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { message: "使用者未登入", error: authError?.message },
        { status: 401 }
      );
    }

    const profileId = user.id; // Supabase auth UUID

    // 3️⃣ Upsert 資料到 profiles
    const { data, error } = await supabase
      .from("profiles")
      .upsert({
        id: profileId,
        line_user_id: userId,
        line_display_name: displayName || null,
        line_avatar_url: pictureUrl || null,
        line_status_message: statusMessage || null,
        updated_at: new Date(),
      })
      .select(); // 回傳更新後資料

    if (error) {
      console.error("資料庫更新失敗:", error);
      return NextResponse.json(
        { message: "資料庫更新失敗", error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "LINE 已成功綁定！",
      profile: data[0], // 回傳最新資料
    });
  } catch (err) {
    console.error("伺服器錯誤:", err);
    return NextResponse.json(
      { message: "伺服器錯誤", error: err.message },
      { status: 500 }
    );
  }
}
