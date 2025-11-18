import linebot from 'linebot';

const bot = linebot({
  channelId: process.env.LINE_CHANNEL_ID,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN
});

export const config = {
  api: {
    bodyParser: false
  }
};

export default async function handler(req, res) {
  if (req.method === 'POST') {
    bot.parser(req, res);
  } else {
    res.status(405).send('Method Not Allowed');
  }
}

// 註冊訊息事件
bot.on('message', async function (event) {
  const msg = event.message.text;

  if (msg === 'hi') {
    await event.reply('嘿嘿～Next.js 正在聽你說話 😎');
  } else {
    await event.reply(`你說的是：「${msg}」`);
  }
});