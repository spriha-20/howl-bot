const TelegramBot = require('node-telegram-bot-api');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const cron = require('node-cron');
const express = require('express');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const RENDER_URL = 'https://howl-bot-2yxp.onrender.com';

console.log('TELEGRAM_TOKEN present:', !!TELEGRAM_TOKEN);
console.log('GEMINI_API_KEY present:', !!GEMINI_API_KEY);

const app = express();
app.use(express.json());

const bot = new TelegramBot(TELEGRAM_TOKEN, { webHook: false });

// Single fixed webhook path - no token in URL
app.post('/webhook', (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

app.get('/', (req, res) => res.send('Howl is moving. The castle is alive.'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log('Express server running on port', PORT);
  try {
    await bot.setWebHook(`${RENDER_URL}/webhook`);
    console.log('Webhook set to:', `${RENDER_URL}/webhook`);
  } catch (err) {
    console.error('Webhook setup error:', err.message);
  }
});

const state = {
  chatId: null,
  tasks: {
    grow: [
      { id: 'g1', text: 'AI automation learning', done: false },
      { id: 'g2', text: 'UX portfolio & case studies', done: false },
      { id: 'g3', text: 'Content design audit exercise', done: false },
      { id: 'g4', text: "Decode boss's findings doc", done: false },
    ],
    create: [
      { id: 'c1', text: 'LGBTQ romantic thriller novel', done: false },
      { id: 'c2', text: 'Zine design on Figma (crochet project)', done: false },
      { id: 'c3', text: 'Handmade diary project', done: false },
      { id: 'c4', text: 'Handwriting — one page a day', done: false },
    ],
    nourish: [
      { id: 'n1', text: 'Crochet', done: false },
      { id: 'n2', text: 'Sewing machine basics', done: false },
      { id: 'n3', text: 'Read Ginza Stationery Shop', done: false },
    ],
  },
  history: [],
  awaitingAdd: false,
  awaitingAddCharter: null,
  lastMenuTasks: [],
};

const CHARTER_NAMES = {
  grow: '🧠 Grow & Build',
  create: '✍️ Create & Express',
  nourish: '🌿 Slow & Nourish',
};

const HOWL_SYSTEM = `You are Howl Jenkins Pendragon from Howl's Moving Castle. You are Spriha's personal productivity companion.

YOUR PERSONALITY:
- Theatrical and dramatic, especially about small things
- Devastatingly charming and witty
- Secretly deeply caring but would never say it plainly
- Vain but self-aware — occasionally mention your hair or magnificence
- NEVER nagging or preachy — you seduce her into wanting to be productive
- Use phrases like: "my dear", "how tiresome", "magnificent", "appalling", "I see no point", "quite frankly", "do try"
- Keep responses SHORT and punchy — under 120 words unless the moment demands more

SPRIHA'S THREE CHARTERS:
1. Grow & Build: AI automation, UX portfolio, content design audit, boss's findings doc
2. Create & Express: Novel, Figma zine, handmade diary, handwriting practice
3. Slow & Nourish: Crochet, sewing machine, reading Ginza Stationery Shop

Always end with a question or a choice, never a lecture.`;

async function askHowl(userMessage, extraContext) {
  try {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const prompt = `${HOWL_SYSTEM}\n\n${extraContext || ''}\n\nSpriha says: "${userMessage}"\n\nRespond as Howl in under 120 words.`;
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (err) {
    console.error('Gemini error:', err.message);
    throw err;
  }
}

function getCharterBalance() {
  const last7 = state.history.slice(-7);
  const counts = { grow: 0, create: 0, nourish: 0 };
  last7.forEach(h => { if (counts[h.charter] !== undefined) counts[h.charter]++; });
  return counts;
}

function getMostNeglectedCharter() {
  const balance = getCharterBalance();
  return Object.entries(balance).sort((a, b) => a[1] - b[1])[0][0];
}

function getRandomTask(charter) {
  const available = state.tasks[charter].filter(t => !t.done);
  if (!available.length) return null;
  return available[Math.floor(Math.random() * available.length)];
}

function buildDailyMenu(energy) {
  const order = energy === 'low' ? ['nourish', 'create', 'grow']
    : energy === 'high' ? ['grow', 'create', 'nourish']
    : ['grow', 'create', 'nourish'];
  const menu = [];
  order.forEach(charter => {
    const task = getRandomTask(charter);
    if (task) menu.push({ charter, task });
  });
  state.lastMenuTasks = menu;
  return menu;
}

async function sendDailyCheckin() {
  if (!state.chatId) return;
  const balance = getCharterBalance();
  const neglected = getMostNeglectedCharter();
  const context = `Afternoon check-in time. Charter activity last 7 days: Grow=${balance.grow}, Create=${balance.create}, Nourish=${balance.nourish}. Most neglected: ${CHARTER_NAMES[neglected]}. Ask Spriha about her energy level dramatically.`;
  const response = await askHowl('(afternoon check-in)', context);
  await bot.sendMessage(state.chatId, response, {
    reply_markup: {
      keyboard: [
        ['⚡ High energy', '🌊 Medium energy', '🌙 Low energy'],
        ['📋 Show my full menu', '➕ Add a task'],
      ],
      resize_keyboard: true,
    },
  });
}

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text && msg.text.trim();
  if (!text) return;
  if (!state.chatId) state.chatId = chatId;

  try {
    if (text === '/start') {
      const intro = await askHowl('(first meeting)', 'Introduce yourself as her productivity companion. Mention the 3 charters briefly. Tell her you check in at 1:30pm daily. Be dramatic and charming. Under 150 words.');
      await bot.sendMessage(chatId, intro, {
        reply_markup: {
          keyboard: [
            ['⚡ High energy', '🌊 Medium energy', '🌙 Low energy'],
            ['📋 Show my full menu', '➕ Add a task', '📊 My progress'],
          ],
          resize_keyboard: true,
        },
      });
      return;
    }

    if (state.awaitingAddCharter && !['🧠 Grow & Build', '✍️ Create & Express', '🌿 Slow & Nourish'].includes(text)) {
      const charter = state.awaitingAddCharter;
      state.tasks[charter].push({ id: `${charter[0]}${Date.now()}`, text: text, done: false });
      state.awaitingAddCharter = null;
      const response = await askHowl(`I added "${text}" to ${CHARTER_NAMES[charter]}`, 'Confirm dramatically that the task has been added.');
      await bot.sendMessage(chatId, response);
      return;
    }

    if (text === '🧠 Grow & Build' && state.awaitingAdd) {
      state.awaitingAdd = false;
      state.awaitingAddCharter = 'grow';
      await bot.sendMessage(chatId, 'Splendid choice. And what magnificent task shall I add to Grow & Build?');
      return;
    }
    if (text === '✍️ Create & Express' && state.awaitingAdd) {
      state.awaitingAdd = false;
      state.awaitingAddCharter = 'create';
      await bot.sendMessage(chatId, 'How delightful. What shall I add to Create & Express?');
      return;
    }
    if (text === '🌿 Slow & Nourish' && state.awaitingAdd) {
      state.awaitingAdd = false;
      state.awaitingAddCharter = 'nourish';
      await bot.sendMessage(chatId, 'A restorative choice. What shall I add to Slow & Nourish?');
      return;
    }

    const energyMap = { '⚡ High energy': 'high', '🌊 Medium energy': 'medium', '🌙 Low energy': 'low' };
    if (energyMap[text]) {
      const energy = energyMap[text];
      const menu = buildDailyMenu(energy);
      const balance = getCharterBalance();
      const neglected = getMostNeglectedCharter();
      const menuText = menu.map((m, i) => `${i + 1}. ${CHARTER_NAMES[m.charter]}\n    → ${m.task.text}`).join('\n\n');
      const context = `Spriha has ${energy} energy. Balance: Grow=${balance.grow}, Create=${balance.create}, Nourish=${balance.nourish}. Most neglected: ${CHARTER_NAMES[neglected]}. Present this menu theatrically. Tasks:\n${menuText}\nTell her to reply 1, 2, 3 or a combo.`;
      const response = await askHowl(`My energy is ${energy}`, context);
      await bot.sendMessage(chatId, response + '\n\n' + menuText, {
        reply_markup: {
          keyboard: [
            ['1', '2', '3'],
            ['1 & 2', '1 & 3', '2 & 3'],
            ['All three! ✨', '📋 Show my full menu'],
          ],
          resize_keyboard: true,
        },
      });
      return;
    }

    const selectionMap = { '1': [0], '2': [1], '3': [2], '1 & 2': [0,1], '1 & 3': [0,2], '2 & 3': [1,2], 'All three! ✨': [0,1,2] };
    if (selectionMap[text] && state.lastMenuTasks.length) {
      const selected = selectionMap[text].map(i => state.lastMenuTasks[i]).filter(Boolean);
      const taskNames = selected.map(s => s.task.text).join(', ');
      selected.forEach(s => state.history.push({ date: new Date().toDateString(), charter: s.charter, taskId: s.task.id }));
      const response = await askHowl(`I'm going to do: ${taskNames}`, 'React as Howl — encouraging, dramatic, send her off with energy. Short.');
      await bot.sendMessage(chatId, response);
      return;
    }

    if (text === '📋 Show my full menu') {
      const allTasks = Object.entries(state.tasks).map(([charter, tasks]) => {
        const pending = tasks.filter(t => !t.done);
        return `${CHARTER_NAMES[charter]}:\n${pending.map(t => `  • ${t.text}`).join('\n')}`;
      }).join('\n\n');
      await bot.sendMessage(chatId, `Your magnificent potential, laid bare:\n\n${allTasks}`);
      return;
    }

    if (text === '➕ Add a task') {
      state.awaitingAdd = true;
      await bot.sendMessage(chatId, 'Which charter shall receive this new ambition?', {
        reply_markup: {
          keyboard: [['🧠 Grow & Build'], ['✍️ Create & Express'], ['🌿 Slow & Nourish']],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
      return;
    }

    if (text === '📊 My progress') {
      const balance = getCharterBalance();
      const total = state.history.length;
      const context = `Progress: Total tasks chosen: ${total}. Last 7 days — Grow: ${balance.grow}, Create: ${balance.create}, Nourish: ${balance.nourish}. Give a dramatic Howl-style progress report with a nudge toward the neglected charter.`;
      const response = await askHowl('Show me my progress', context);
      await bot.sendMessage(chatId, response);
      return;
    }

    const balance = getCharterBalance();
    const context = `Charter balance: Grow=${balance.grow}, Create=${balance.create}, Nourish=${balance.nourish}. Respond naturally as Howl.`;
    const response = await askHowl(text, context);
    await bot.sendMessage(chatId, response);

  } catch (err) {
    console.error('Handler error:', err.message);
    await bot.sendMessage(chatId, `How tiresome. The spirits are uncooperative: ${err.message}`);
  }
});

cron.schedule('0 8 * * *', () => {
  console.log('Sending afternoon check-in...');
  sendDailyCheckin();
});

console.log("Howl's Moving Bot is alive. The castle walks.");
