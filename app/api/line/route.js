import { Client } from "@line/bot-sdk";
import { getImageUrlsByKeyword, generateAnswer } from "@/lib/grokmain";
import { IMAGE_KEYWORDS } from "@/utils/keywords";
import {
  facilityCarousel,
  buildImageCarousel,
} from "@/utils/lineMessage";

// 強制 Node.js runtime
export const runtime = "nodejs";

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new Client(config);

export async function POST(req) {
  try {
    const rawBody = await req.text();
    if (!rawBody)
      return new Response("Bad Request: Empty body", { status: 400 });

    let events;
    try {
      events = JSON.parse(rawBody).events;
    } catch {
      return new Response("Bad Request: Invalid JSON", { status: 400 });
    }

    for (const event of events) {
      if (event.type !== "message" || event.message.type !== "text")
        continue;

      const userText = event.message.text.trim();
      const replyToken = event.replyToken;

      console.log("使用者輸入:", userText);

      // 1️⃣ 公共設施：固定 Flex
      if (userText.includes("公共設施")) {
        await client.replyMessage(replyToken, facilityCarousel());
        continue;
      }

      // 2️⃣ 圖片查詢：Supabase
      if (IMAGE_KEYWORDS.some((kw) => userText.includes(kw))) {
        const images = await getImageUrlsByKeyword(userText);

        if (!images || images.length === 0) {
          await client.replyMessage(replyToken, {
            type: "text",
            text: "目前沒有找到相關圖片喔～",
          });
        } else {
          await client.replyMessage(
            replyToken,
            buildImageCarousel(images)
          );
        }
        continue;
      }

      // 3️⃣ 其他 → LLM（Groq）
      try {
        const answer = await generateAnswer(userText);
        await client.replyMessage(replyToken, {
          type: "text",
          text:
            answer?.trim() || "目前查不到資訊，可以查看社區公告喔～",
        });
      } catch (error) {
        console.error("LLM API 錯誤:", error);
        await client.replyMessage(replyToken, {
          type: "text",
          text: "查詢失敗，請稍後再試。",
        });
      }
    }

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}

export async function GET() {
  return new Response("Method Not Allowed", { status: 405 });
}
