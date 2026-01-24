import linebot from 'linebot';
import { createMessageWithFeedback, createClarificationQuickReply } from '../../utils/lineMessage.js';

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
  const userId = event.source.userId;
  const eventId = event.webhookEventId; // LINE 事件唯一 ID
  
  let replyText = '';
  let chatLogId = null;
  
  if (msg === 'hi') {
    replyText = '嘿嘿～Next.js 正在聽你說話 😎';
    await event.reply(replyText);
  } else {
    try {
      const axios = (await import('axios')).default;
      const response = await axios.post('http://localhost:3000/api/llm', { 
        query: msg,
        userId: userId,
        eventId: eventId // 傳遞 eventId 防重複
      });
      
      replyText = response.data.answer || 'API 沒有回覆答案';
      chatLogId = response.data.chatLogId;
      console.log('[DEBUG] API Response:', JSON.stringify(response.data, null, 2));
      console.log('[DEBUG] chatLogId:', chatLogId);
      
      // 如果有 chatLogId，使用帶回饋按鈕的訊息
      if (chatLogId) {
        const messageWithFeedback = createMessageWithFeedback(replyText, chatLogId);
        console.log('[DEBUG] Message with feedback:', JSON.stringify(messageWithFeedback, null, 2));
        await event.reply(messageWithFeedback);
      } else {
        console.log('[WARNING] 沒有 chatLogId，只回覆純文字');
        await event.reply(replyText);
      }
    } catch (error) {
      console.error('[API Error]', error);
      replyText = 'API 請求失敗';
      await event.reply(replyText);
    }
  }
});

// 註冊 postback 事件處理回饋
bot.on('postback', async function (event) {
  const data = event.postback.data;
  const userId = event.source.userId;
  
  // 解析 postback data
  const params = new URLSearchParams(data);
  const action = params.get('action');
  const chatLogId = params.get('chatLogId');
  
  if (action === 'feedback') {
    const feedbackType = params.get('type');
    
    try {
      const axios = (await import('axios')).default;
      const response = await axios.post('http://localhost:3000/api/feedback', {
        chatLogId: parseInt(chatLogId),
        feedbackType,
        userId
      });
      
      const { message, nextActions } = response.data;
      
      // 根據回饋類型回覆
      if (feedbackType === 'unclear' && nextActions) {
        // 提供澄清選項
        const quickReply = createClarificationQuickReply(chatLogId, nextActions);
        await event.reply({
          type: 'text',
          text: message,
          quickReply
        });
      } else {
        await event.reply(message);
      }
    } catch (error) {
      console.error('[Feedback Error]', error);
      await event.reply('回饋處理失敗，請稍後再試');
    }
  } else if (action === 'clarify') {
    const choice = params.get('choice');
    
    try {
      // 記錄澄清選擇
      const axios = (await import('axios')).default;
      await axios.post('http://localhost:3000/api/feedback', {
        chatLogId: parseInt(chatLogId),
        feedbackType: 'unclear',
        userId,
        clarificationChoice: choice
      });
      
      // 根據選擇提供更詳細的回答
      await event.reply('好的，讓我針對這個部分提供更詳細的說明...\n（這裡可以根據 choice 提供更精確的答案）');
    } catch (error) {
      console.error('[Clarification Error]', error);
      await event.reply('處理失敗，請稍後再試');
    }
  }
});                                                      