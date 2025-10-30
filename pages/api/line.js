// pages/api/line.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  console.log('✅ LINE Webhook received:', req.body);

  res.status(200).json({ message: 'Webhook received' });
}