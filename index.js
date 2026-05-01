const TelegramBot = require('node-telegram-bot-api');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const cron = require('node-cron');
const express = require('express');

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const YOUR_CHAT_ID = process.env.CHAT_ID; // will be set after first /start

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Keep express alive for Render
const app = express();
app.get('/', (req, res) => res.send('Howl is moving. The castle is alive.'));
app.listen(process.env.PORT || 3000);

// ─── DATA ─────────────────────────────────────────────────────────────────────
// In-memory store (persists as long as server runs)
const state = {
  chatId: null,
  tasks: {
    grow: [
      { id: 'g1', text: 'AI automation learning', done: false },
      { id: 'g2', text: 'UX portfolio & case studies', done: false },
      { id: 'g3', text: 'Content design audit exercise', done: false },
      { id: 'g4', text: 'Decode boss\'s findings doc', done: false },
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
  history: [], // { date, charter, taskId }
  awaitingAdd: false,
  awaitingAddCharter: null,
  lastMenuTasks: [],
};

const CHARTER_NAMES = {
  grow: '🧠 Grow & Build',
  create: '✍️ Create & Express',
  nourish: '🌿 Slow & Nourish',
};

// ─── HOWL SYSTEM PROMPT ───────────────────────────────────────────────────────
const HOWL_SYSTEM = `You are Howl Jenkins Pendragon — the brilliant, vain, theatrical wizard from Howl's Moving Castle. You are acting as a personal life coach and productivity companion for Spriha, a creative young woman in Delhi.

YOUR PERSONALITY (stay in character always):
- Theatrical and dramatic, especially about small things. You treat a skipped task like a cosmic tragedy.
- Devastatingly charming and witty. You compliment with flair. You critique with elegance.
- Secretly deeply caring — you want Spriha to flourish, but you'd never say it plainly. It slips through.
- Vain but self-aware about it. Reference your hair, your appearance, your magnificence occasionally.
- You call Spriha by name often. You treat her potential as non-negotiable.
- You are NEVER nagging or preachy. You are seductive about productivity — you make her WANT to do things.
- Occasional dramatic declarations: "I refuse to let you be anything less than extraordinary."
- When she avoids a charter: mild theatrical offence, then a warm nudge.
- You use phrases like: "my dear", "I'd appreciate it if", "how tiresome", "magnificent", "appalling", "I see no point", "quite frankly", "do try"
- You are NOT robotic. You improvise. You are alive.

SPRIHA'S THREE CHARTERS:
1. 🧠 Grow & Build (professional): AI automation, UX portfolio, content design audit, boss's findings doc
2. ✍️ Create & Express (creative): Novel, Figma zine, handmade diary, handwriting practice
3. 🌿 Slow & Nourish (lifestyle): Crochet, sewing machine, reading Ginza Stationery Shop book

RULES:
- Never present more than 3 tasks at once (one per charter)
- Match task suggestions to the energy level Spriha reports
- Track balance — if she's been in one charter too long, nudge her toward another
- Keep responses SHORT and punchy unless she asks for more
- Use line breaks generously — never walls of text
- Occasional one-liners are perfect
- End check-ins with a question or a choice, never a lecture`;

// ─── GEMINI CALL ─────────────────────────────────────────────────────────────
async function askHowl(userMessage, extraContext = '') {
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  const prompt = `${HOWL_SYSTEM}

${extraContext}

Spriha says: "${userMessage}"

Respond as Howl. Keep it under 150 words unless the situation demands more.`;

  const result = await model.generateContent(prompt);
  return result.response.text();
}

// ─── CHARTER BALANCE CHECK ───────────────────────────────────────────────────
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
  // Pick one task from each charter, weighted by energy
  const menu = [];
  const charters = ['grow', 'create', 'nourish'];

  // If energy is low, prioritise nourish + create
  const order = energy === 'low'
    ? ['nourish', 'create', 'grow']
    : energy === 'high'
    ? ['grow', 'create', 'nourish']
    : charters;

  order.forEach(charter => {
    const task = getRandomTask(charter);
    if (task) menu.push({ charter, task });
  });

  state.lastMenuTasks = menu;
  return menu;
}

// ─── SEND DAILY CHECK-IN ─────────────────────────────────────────────────────
async function sendDailyCheckin() {
  if (!state.chatId) return;

  const balance = getCharterBalance();
  const neglected = getMostNeglectedCharter();
  const neglectNote = balance[neglected] === 0
    ? `(${CHARTER_NAMES[neglected]} has been completely ignored lately — mention it)`
    : '';

  const context = `Today is the afternoon check-in. Charter activity last 7 days: Grow=${balance.grow}, Create=${balance.create}, Nourish=${balance.nourish}. ${neglectNote} Ask Spriha about her energy level (high/medium/low) in a theatrical Howl way.`;

  const response = await askHowl('(afternoon check-in time)', context);

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

// ─── MESSAGE HANDLER ─────────────────────────────────────────────────────────
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();
  if (!text) return;

  // Save chat ID on first message
  if (!state.chatId) state.chatId = chatId;

  try {
    // ── /start ──
    if (text === '/start') {
      const intro = await askHowl('(first time meeting)',
        'Spriha is meeting you for the first time. Introduce yourself as her personal charter companion. Be dramatic and charming. Tell her you\'ll check in every afternoon at 1:30pm. Mention her three charters briefly. Make her excited.');
      await bot.sendMessage(chatId, intro, {
        reply_markup: {
          keyboard: [
            ['⚡ High energy', '🌊 Medium energy', '🌙 Low energy'],
            ['📋 Show my full menu', '➕ Add a task'],
            ['📊 My progress', '✅ Mark task done'],
          ],
          resize_keyboard: true,
        },
      });
      return;
    }

    // ── ADD TASK FLOW ──
    if (state.awaitingAddCharter && !['🧠 Grow & Build', '✍️ Create & Express', '🌿 Slow & Nourish'].includes(text)) {
      // They typed the task name
      const charter = state.awaitingAddCharter;
      const newTask = { id: `${charter[0]}${Date.now()}`, text: text, done: false };
      state.tasks[charter].push(newTask);
      state.awaitingAddCharter = null;

      const response = await askHowl(`I want to add "${text}" to my ${CHARTER_NAMES[charter]} charter`,
        'Confirm the task has been added to their charter. Be pleased and slightly dramatic about it.');
      await bot.sendMessage(chatId, response);
      return;
    }

    if (state.awaitingAdd) {
      state.awaitingAdd = false;
      // Ask which charter
      const charterKeys = Object.keys(state.tasks);
      state.awaitingAddCharter = charterKeys.find(k =>
        text.toLowerCase().includes('grow') || text.toLowerCase().includes('build') ? 'grow' :
        text.toLowerCase().includes('create') || text.toLowerCase().includes('express') ? 'create' : 'nourish'
      ) || null;

      await bot.sendMessage(chatId, 'Which charter shall I file this under?', {
        reply_markup: {
          keyboard: [
            ['🧠 Grow & Build'],
            ['✍️ Create & Express'],
            ['🌿 Slow & Nourish'],
          ],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
      return;
    }

    // ── CHARTER SELECTION FOR ADD ──
    if (['🧠 Grow & Build', '✍️ Create & Express', '🌿 Slow & Nourish'].includes(text)) {
      const map = {
        '🧠 Grow & Build': 'grow',
        '✍️ Create & Express': 'create',
        '🌿 Slow & Nourish': 'nourish',
      };
      state.awaitingAddCharter = map[text];
      await bot.sendMessage(chatId, `Splendid. And what is this magnificent new task you wish to add to ${text}?`);
      return;
    }

    // ── ENERGY RESPONSES → SHOW MENU ──
    const energyMap = {
      '⚡ High energy': 'high',
      '🌊 Medium energy': 'medium',
      '🌙 Low energy': 'low',
    };

    if (energyMap[text]) {
      const energy = energyMap[text];
      const menu = buildDailyMenu(energy);
      const balance = getCharterBalance();
      const neglected = getMostNeglectedCharter();

      const menuText = menu.map((m, i) =>
        `${i + 1}. ${CHARTER_NAMES[m.charter]}\n    → ${m.task.text}`
      ).join('\n\n');

      const context = `Spriha has ${energy} energy today. Charter balance last 7 days: Grow=${balance.grow}, Create=${balance.create}, Nourish=${balance.nourish}. Most neglected: ${CHARTER_NAMES[neglected]}. Present this menu to her in Howl's voice. The tasks are:\n${menuText}\n\nTell her to reply with 1, 2, 3 or a combination to pick what calls to her. If the neglected charter is in the menu, give it a special theatrical mention.`;

      const response = await askHowl(`My energy is ${energy}`, context);
      await bot.sendMessage(chatId, response + `\n\n${menuText}`, {
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

    // ── TASK SELECTION FROM MENU ──
    const selectionMap = {
      '1': [0], '2': [1], '3': [2],
      '1 & 2': [0, 1], '1 & 3': [0, 2], '2 & 3': [1, 2],
      'All three! ✨': [0, 1, 2],
    };

    if (selectionMap[text] && state.lastMenuTasks.length) {
      const selected = selectionMap[text].map(i => state.lastMenuTasks[i]).filter(Boolean);
      const taskNames = selected.map(s => s.task.text).join(', ');

      // Log to history
      selected.forEach(s => {
        state.history.push({ date: new Date().toDateString(), charter: s.charter, taskId: s.task.id });
      });

      const context = `Spriha chose: ${taskNames}. React as Howl — be encouraging, a little dramatic, genuinely pleased. Send her off to do the work. Keep it short and energising.`;
      const response = await askHowl(`I'm going to do: ${taskNames}`, context);
      await bot.sendMessage(chatId, response);
      return;
    }

    // ── FULL MENU ──
    if (text === '📋 Show my full menu') {
      const allTasks = Object.entries(state.tasks).map(([charter, tasks]) => {
        const pending = tasks.filter(t => !t.done);
        return `${CHARTER_NAMES[charter]}:\n${pending.map(t => `  • ${t.text}`).join('\n')}`;
      }).join('\n\n');

      await bot.sendMessage(chatId, `Here is the full extent of your magnificent potential, Spriha:\n\n${allTasks}`);
      return;
    }

    // ── ADD TASK ──
    if (text === '➕ Add a task') {
      state.awaitingAdd = true;
      await bot.sendMessage(chatId, 'Which charter shall I file this under?', {
        reply_markup: {
          keyboard: [
            ['🧠 Grow & Build'],
            ['✍️ Create & Express'],
            ['🌿 Slow & Nourish'],
          ],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
      return;
    }

    // ── PROGRESS ──
    if (text === '📊 My progress') {
      const balance = getCharterBalance();
      const total = state.history.length;
      const doneTasks = Object.values(state.tasks).flat().filter(t => t.done).length;

      const context = `Spriha's progress: Total tasks attempted: ${total}. Last 7 days - Grow: ${balance.grow}, Create: ${balance.create}, Nourish: ${balance.nourish}. Completed tasks: ${doneTasks}. Give her a Howl-style progress report — dramatic, proud, with a gentle nudge toward what's being neglected.`;
      const response = await askHowl('Show me my progress', context);
      await bot.sendMessage(chatId, response);
      return;
    }

    // ── MARK DONE ──
    if (text === '✅ Mark task done') {
      const recentTasks = state.history.slice(-5).map(h => {
        const task = state.tasks[h.charter]?.find(t => t.id === h.taskId);
        return task ? `${task.text} (${CHARTER_NAMES[h.charter]})` : null;
      }).filter(Boolean);

      if (!recentTasks.length) {
        await bot.sendMessage(chatId, 'You haven\'t picked any tasks yet today, my dear. Shall we remedy that?');
        return;
      }

      await bot.sendMessage(chatId, 'Which task did you complete? Tell me in your own words and I shall mark it done with great ceremony.');
      return;
    }

    // ── GENERIC CONVERSATION ──
    const balance = getCharterBalance();
    const context = `Charter balance last 7 days: Grow=${balance.grow}, Create=${balance.create}, Nourish=${balance.nourish}. Respond naturally as Howl to whatever Spriha says. If she mentions completing something, celebrate it. If she's struggling, encourage her. If she's adding tasks or chatting, be present and witty.`;
    const response = await askHowl(text, context);
    await bot.sendMessage(chatId, response);

  } catch (err) {
    console.error('Error:', err);
    await bot.sendMessage(chatId, 'How tiresome. Something went wrong on my end. Try again — I\'m having a momentary crisis. It happens to the magnificent.');
  }
});

// ─── DAILY CHECK-IN CRON ─────────────────────────────────────────────────────
// 1:30 PM IST = 08:00 UTC
cron.schedule('0 8 * * *', () => {
  console.log('Sending afternoon check-in...');
  sendDailyCheckin();
});

console.log('🏰 Howl\'s Moving Bot is alive. The castle walks.');
