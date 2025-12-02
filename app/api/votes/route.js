import { createClient } from '@supabase/supabase-js';
import { Client } from '@line/bot-sdk';

export const runtime = 'nodejs';

// --- LINE Bot ---
const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};
const client = new Client(lineConfig);

// --- Supabase ---
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// ============================================
// POST：管理者發布投票 & 使用者投票
// ============================================
export async function POST(req) {
  try {
    const body = await req.json();

    console.log("📩 Received:", body);

    // ---- 情況 1：使用者投票 vote:ID:option ----
    if (typeof body.vote_message === "string") {
      return await handleUserVote(body);
    }

    // ---- 情況 2：管理者建立投票 ----
    return await handleAdminCreateVote(body);

  } catch (err) {
    console.error("❌ votes POST Error:", err);
    return Response.json(
      { error: "Internal Server Error", details: err.message },
      { status: 500 }
    );
  }
}

// ============================================
// 使用者投票
// ============================================
async function handleUserVote(body) {
  const { vote_message, line_user_id, replyToken } = body;

  console.log("🗳️ User vote:", vote_message);

  // vote:{vote_id}:{option}
  const parts = vote_message.split(":");
  if (parts.length < 3) {
    return Response.json({ error: "Invalid vote message format" }, { status: 400 });
  }

  const voteIdFromMsg = parseInt(parts[1], 10);
  const option_selected = parts[2].replace("🗳️", "").trim();

  if (isNaN(voteIdFromMsg)) {
    return Response.json({ error: "Invalid vote_id" }, { status: 400 });
  }

  // 查詢最新投票
  const { data: latestVote, error: latestVoteError } = await supabase
    .from("votes")
    .select("id, ends_at")
    .order("created_at", { ascending: false })
    .limit(1);

  if (latestVoteError || !latestVote?.[0]) {
    return Response.json({ error: "No active vote found" }, { status: 400 });
  }

  const vote_id = latestVote[0].id;

  console.log("🔍 Latest vote_id =", vote_id);

  // 比對 ID（你的系統最常錯這裡）
  if (voteIdFromMsg !== vote_id) {
    return Response.json({ error: "Vote ID mismatch" }, { status: 400 });
  }

  // 查詢住戶資訊
  const { data: userProfile, error: userError } = await supabase
    .from("line_users")
    .select("display_name, profile_id")
    .eq("line_user_id", line_user_id)
    .single();

  if (userError || !userProfile?.profile_id) {
    return Response.json(
      { error: "User not found or missing profile_id" },
      { status: 400 }
    );
  }

  const user_id = userProfile.profile_id;
  const user_name = userProfile.display_name;

  console.log("👤 User:", user_id, user_name);

  // 使用者是否已投過
  const { data: existingVote } = await supabase
    .from("vote_records")
    .select("id")
    .eq("vote_id", vote_id)
    .eq("user_id", user_id)
    .maybeSingle();

  if (existingVote) {
    return Response.json(
      { error: "Already voted" },
      { status: 400 }
    );
  }

  // 寫入投票記錄
  const voteRecord = {
    vote_id,
    user_id,
    user_name,
    option_selected,
    voted_at: new Date().toISOString(),
  };

  const { error: recordError } = await supabase
    .from("vote_records")
    .insert([voteRecord]);

  if (recordError) {
    console.error("❌ Insert vote record failed:", recordError, voteRecord);
    return Response.json(
      { error: "Failed to record vote", details: recordError.message },
      { status: 500 }
    );
  }

  console.log("✅ Vote Saved:", voteRecord);

  // 回覆 LINE 使用者（可選）
  if (replyToken) {
    try {
      await client.replyMessage(replyToken, [
        { type: "text", text: `確認！您的投票是「${option_selected}」` },
      ]);
    } catch (err) {
      console.error("❌ replyMessage Error:", err);
    }
  }

  return Response.json({
    success: true,
    message: `您投了「${option_selected}」`,
  });
}

// ============================================
// 管理者建立投票
// ============================================
async function handleAdminCreateVote(body) {
  const { title, description, author, ends_at, options, test } = body;

  console.log("📢 Admin create vote:", body);

  if (!title || !author || !ends_at) {
    return Response.json(
      { error: "title, author, ends_at required" },
      { status: 400 }
    );
  }

  if (test === true) {
    return Response.json({ message: "Vote API test OK" });
  }

  const voteOptions = options || ["同意", "反對", "棄權"];
  const time = new Date().toLocaleString("zh-TW", { hour12: false });

  // 新增投票
  const { data: newVote, error: insertError } = await supabase
    .from("votes")
    .insert([
      {
        title,
        description,
        ends_at,
        author,
        options: voteOptions,
        created_at: new Date().toISOString(),
      },
    ])
    .select();

  if (insertError || !newVote?.[0]) {
    console.error("❌ Failed to insert vote:", insertError);
    return Response.json(
      { error: insertError?.message || "Insert failed" },
      { status: 500 }
    );
  }

  const vote_id = newVote[0].id;

  console.log("📌 New vote created:", vote_id);

  // 推播投票給全部 LINE 使用者
  const flexMessage = {
    type: "flex",
    altText: "📢 新投票通知",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          { type: "text", text: "📢 新投票公告", weight: "bold", size: "lg" },
          { type: "separator", margin: "md" },
          { type: "text", text: `📌 標題：${title}`, wrap: true },
          { type: "text", text: `📝 說明：${description || "無"}`, wrap: true },
          { type: "text", text: `⏰ 截止：${ends_at}`, size: "sm", color: "#888" },
          { type: "text", text: `👤 發布者：${author}`, size: "sm", color: "#888" },
          { type: "text", text: `🕒 時間：${time}`, size: "sm", color: "#888" },
        ],
      },
    },
    quickReply: {
      items: voteOptions.map((opt) => ({
        type: "action",
        action: {
          type: "message",
          label: `🗳️ ${opt}`,
          text: `vote:${vote_id}:${opt} 🗳️`,
        },
      })),
    },
  };

  await client.broadcast(flexMessage);

  return Response.json({
    success: true,
    vote_id,
  });
}

// ============================================
// GET 禁用
// ============================================
export async function GET() {
  return Response.json({ error: "Method Not Allowed" }, { status: 405 });
}
