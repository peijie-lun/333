import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(req) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    // 1️⃣ 解析前端資料
    const body = await req.json();
    const { userId, displayName, pictureUrl, statusMessage } = body;

    console.log("收到前端資料:", body);

    if (!userId) {
      return NextResponse.json({ message: "缺少 LINE userId" }, { status: 400 });
    }

    // 2️⃣ 取得 Supabase Auth 使用者
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

    // 3️⃣ Upsert 到 profiles
    console.log("準備 upsert profiles，profileId:", profileId);

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
  } catch (err) {
    console.error("伺服器錯誤:", err);
    return NextResponse.json(
      { message: "伺服器錯誤", error: err.message },
      { status: 500 }
    );
  }
}
