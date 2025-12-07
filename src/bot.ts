import { Bot, webhookCallback } from "grammy";

const token = process.env.BOT_TOKEN;
const webhookUrl = process.env.BOT_WEBHOOK_URL;
const port = Number(process.env.PORT) || 8000;

if (!token) {
  throw new Error("BOT_TOKEN is not set");
}

const bot = new Bot(token);

bot.command("start", (ctx) => ctx.reply("Welcome! Up and running."));

bot.command("help", (ctx) =>
  ctx.reply("Available commands:\n/start - Start the bot\n/help - Show help")
);

bot.on("message", (ctx) => ctx.reply("Got your message!"));

const handleUpdate = webhookCallback(bot, "bun");

Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === "POST" && url.pathname === "/webhook") {
      return handleUpdate(req);
    }

    return new Response("OK", { status: 200 });
  },
});

if (webhookUrl) {
  await bot.api.setWebhook(`${webhookUrl}/webhook`);
  console.log(`Webhook set to ${webhookUrl}/webhook`);
}

console.log(`Bot server running on port ${port}`);

