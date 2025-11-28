import { generateAnswer } from "../../grokmain.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { query } = req.body;
  if (!query) return res.status(400).json({ error: "缺少 query" });

  try {
    const answer = await generateAnswer(query);
    res.status(200).json({ answer });
  } catch (e) {
    console.error("grok API error:", e);
    res.status(500).json({ error: "Server error" });
  }
}
