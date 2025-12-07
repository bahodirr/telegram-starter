# Telegram Bot Starter

A minimal Telegram bot starter using [grammY](https://grammy.dev) webhooks and Bun.

## Setup

1. Install dependencies:

```bash
bun install
```

2. Get a bot token from [@BotFather](https://t.me/BotFather) on Telegram

3. Create a `.env` file with your token:

```bash
BOT_TOKEN=your_bot_token_here
PORT=3000
```

4. Start the server:

```bash
bun run dev   # Development with hot reload
bun run start # Production
```

5. Set your webhook URL with Telegram:

```bash
curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://your-domain.com/webhook"
```

For local development, use [ngrok](https://ngrok.com) or similar:

```bash
ngrok http 3000
# Then set webhook to: https://your-ngrok-url.ngrok.io/webhook
```

## Commands

- `/start` - Start the bot
- `/help` - Show available commands

# telegram-starter
