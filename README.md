# 🏰 Howl's Moving Bot — Deployment Guide

Your personal productivity companion, voiced by Howl Jenkins Pendragon.

## Deploy on Render

### Step 1 — Go to render.com
- New → Web Service → Public Git repo OR manual deploy

### Step 2 — Settings
- Build command: npm install
- Start command: npm start
- Plan: Free

### Step 3 — Environment Variables
Go to your service → Environment tab → add:
- TELEGRAM_TOKEN → your BotFather token
- GEMINI_API_KEY → your Gemini API key

### Step 4 — Done!
Open Telegram → find your bot → send /start

## Commands
- /start — Wake Howl up
- Show my full menu — See all pending tasks
- Add a task — Add to any charter
- My progress — Charter balance report
- Mark task done — Log a completion

Just chat naturally too — tell it what you did, how you feel, what you want to add.
