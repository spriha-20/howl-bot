# 🏰 Howl's Bot Deployment Guide

A personal productivity companion on Telegram, voiced by Howl Jenkins Pendragon from Howl's Moving Castle.

Built by Spriha as a personal AI automation project.

---

## What it does

The bot checks in every afternoon at 1:30pm IST and presents a daily task menu across three life charters. It tracks which areas you are spending time on and nudges you toward balance. You can also chat with it freely at any time.

The three charters are:

- Grow and Build: career, skills, professional growth
- Create and Express: writing, art, design, creative projects
- Slow and Nourish: reading, crochet, sewing, rest

---

## How it works

- Built with Node.js
- Telegram bot via node-telegram-bot-api
- AI responses powered by Groq (llama-3.3-70b-versatile, free tier)
- Deployed on Render (free tier)
- Daily 1:30pm IST check-in triggered via node-cron (cron job scheduled at 08:00 UTC)
- Server kept alive 24/7 via UptimeRobot so the cron job never misses
- Webhook based connection to Telegram (no polling conflicts)
- Express.js server handles incoming Telegram webhook requests

---

## How to set it up yourself

### Step 1: Create a Telegram bot

1. Open Telegram and search for BotFather
2. Send /newbot and follow the steps
3. Copy the token BotFather gives you

### Step 2: Get a Groq API key

1. Go to console.groq.com
2. Sign up for free, no credit card needed
3. Create an API key

### Step 3: Deploy on Render

1. Go to render.com and create a free account
2. New Web Service, connect your GitHub repo
3. Build command: npm install
4. Start command: npm start
5. Add these environment variables:
   - TELEGRAM_TOKEN: your BotFather token
   - GROQ_API_KEY: your Groq API key
6. Deploy

### Step 4: Keep it alive

1. Go to uptimerobot.com
2. Create a free HTTP monitor pointing to your Render URL
3. Set interval to 5 minutes

This stops Render from sleeping and makes sure the daily check-in fires every day at 1:30pm.

### Step 5: Start chatting

Open Telegram, find your bot, send /start.

---

## Commands

- /start: Wake the bot up
- High / Medium / Low energy: Get your daily task menu
- Show my full menu: See all pending tasks across all charters
- Add a task: Add something new to any charter
- My progress: See your charter balance over the last 7 days

You can also just chat freely. Tell it what you finished, how you are feeling, or anything you want it to remember.

---

## Tech stack

Node.js, Express.js, node-telegram-bot-api, node-cron, Groq API, Render, UptimeRobot, GitHub.

Total monthly cost: free.
