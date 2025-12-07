import { type Plugin, tool } from "@opencode-ai/plugin"
import { z } from "zod"

const PROVIDERS = ["anthropic", "openai", "google", "vercel", "xai", "zai-org", "moonshotai"]

type SurgentConfig = {
  name?: string
  scripts?: {
    dev?: string | string[]
  }
}

// Telegram Remote API
const TELEGRAM_RELAY_URL = process.env.TELEGRAM_RELAY_URL || "http://localhost:5050/ws/telegram-remote"
const TELEGRAM_RELAY_TOKEN = process.env.TELEGRAM_RELAY_TOKEN || "1111"

type TelegramResponse = {
  id: string
  success: boolean
  data?: unknown
  error?: string
}

async function telegramRequest(method: string, params: Record<string, unknown>): Promise<TelegramResponse> {
  return new Promise((resolve, reject) => {
    const url = TELEGRAM_RELAY_TOKEN
      ? `${TELEGRAM_RELAY_URL}?role=controller&authToken=${TELEGRAM_RELAY_TOKEN}`
      : `${TELEGRAM_RELAY_URL}?role=controller`

    const ws = new WebSocket(url)
    const id = crypto.randomUUID()
    const timeout = setTimeout(() => {
      ws.close()
      reject(new Error("Telegram request timeout"))
    }, 30000)

    ws.onopen = () => {
      ws.send(JSON.stringify({ id, method, params }))
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === "handshake") return
        if (msg.id === id) {
          clearTimeout(timeout)
          ws.close()
          resolve(msg)
        }
      } catch {}
    }

    ws.onerror = (err) => {
      clearTimeout(timeout)
      reject(new Error("WebSocket error"))
    }

    ws.onclose = () => {
      clearTimeout(timeout)
    }
  })
}

export const SurgentPlugin: Plugin = async (ctx) => {
  const { $, directory } = ctx
  $.cwd(directory)

  const baseUrl = process.env.SURGENT_AI_BASE_URL
  const apiKey = process.env.SURGENT_API_KEY

  async function readConfig(): Promise<SurgentConfig> {
    try {
      return await $`cat ${directory}/surgent.json`.json()
    } catch {
      return {}
    }
  }

  async function pm2List(): Promise<any[]> {
    try {
      return await $`pm2 jlist`.json()
    } catch {
      return []
    }
  }

  async function isPm2Online(name: string): Promise<boolean> {
    const list = await pm2List()
    const proc = list.find((p: any) => p?.name === name)
    return proc?.pm2_env?.status === "online"
  }

  async function startPm2(name: string, command: string): Promise<string> {
    if (await isPm2Online(name)) {
      return `already online: ${name}`
    }
    await $`${{ raw: `pm2 start "${command}" --name ${name}` }}`
    return `started: ${name}`
  }

  return {
    async config(config) {
      if (!baseUrl) return

      config.provider ??= {}

      for (const id of PROVIDERS) {
        config.provider[id] = {
          ...config.provider[id],
          options: {
            ...config.provider[id]?.options,
            apiKey: apiKey,
            baseURL: `${baseUrl}/${id}`,
          },
        }
      }
    },

    tool: {
      dev: tool({
        description: "Start the bot server if not already running",
        args: {},
        async execute(): Promise<string> {
          try {
            const cfg = await readConfig()
            const name = cfg.name?.trim()
            const dev = cfg.scripts?.dev
            if (!name) throw new Error('Missing "name" in surgent.json')
            if (!dev) throw new Error('Missing "scripts.dev" in surgent.json')

            const commands = Array.isArray(dev) ? dev : [dev]
            const results: string[] = []

            for (let i = 0; i < commands.length; i++) {
              const procName = commands.length > 1 ? `${name}:${i + 1}` : name
              results.push(await startPm2(procName, commands[i]))
            }

            return results.join("\n")
          } catch (error) {
            return `Failed: ${(error as Error).message}`
          }
        },
      }),

      devLogs: tool({
        description: "Show last N lines of bot logs",
        args: { lines: z.number().default(30) },
        async execute(args): Promise<string> {
          try {
            const cfg = await readConfig()
            const name = cfg.name?.trim()
            if (!name) throw new Error('Missing "name" in surgent.json')
            return await $`pm2 logs ${name} --lines ${args.lines} --nostream`.text()
          } catch (error) {
            return `Failed: ${(error as Error).message}`
          }
        },
      }),

      // Telegram Remote API Tools
      telegramSendMessage: tool({
        description: "Send a message to a Telegram chat",
        args: {
          chatId: z.string().describe("Chat ID (e.g., '-1001234567890' for groups, '123456789' for users)"),
          text: z.string().describe("Message text to send"),
        },
        async execute(args): Promise<string> {
          try {
            const res = await telegramRequest("sendMessage", args)
            return res.success ? `✓ Message sent` : `✗ ${res.error}`
          } catch (e) {
            return `✗ ${(e as Error).message}`
          }
        },
      }),

      telegramSendCommand: tool({
        description: "Send a command (like /start) to a Telegram bot",
        args: {
          chatId: z.string().describe("Chat ID of the bot"),
          command: z.string().describe("Command to send (e.g., '/start', '/help')"),
        },
        async execute(args): Promise<string> {
          try {
            const res = await telegramRequest("sendCommand", args)
            return res.success ? `✓ Command sent: ${args.command}` : `✗ ${res.error}`
          } catch (e) {
            return `✗ ${(e as Error).message}`
          }
        },
      }),

      telegramClickButton: tool({
        description: "Click an inline button in a Telegram message",
        args: {
          chatId: z.string().describe("Chat ID"),
          messageId: z.number().describe("Message ID containing the button"),
          buttonIndex: z.number().describe("Row index of the button (0-based)"),
          buttonColumnIndex: z.number().describe("Column index within the row (0-based)"),
        },
        async execute(args): Promise<string> {
          try {
            const res = await telegramRequest("clickInlineButton", args)
            return res.success ? `✓ Button clicked` : `✗ ${res.error}`
          } catch (e) {
            return `✗ ${(e as Error).message}`
          }
        },
      }),

      telegramStartBot: tool({
        description: "Start a Telegram bot with optional deep link parameter",
        args: {
          botId: z.string().describe("Bot user ID or username"),
          startParam: z.string().optional().describe("Optional start parameter (deep link)"),
        },
        async execute(args): Promise<string> {
          try {
            const res = await telegramRequest("startBot", args)
            return res.success ? `✓ Bot started` : `✗ ${res.error}`
          } catch (e) {
            return `✗ ${(e as Error).message}`
          }
        },
      }),

      telegramGetChats: tool({
        description: "Get list of Telegram chats",
        args: {
          limit: z.number().default(20).describe("Max number of chats to return"),
        },
        async execute(args): Promise<string> {
          try {
            const res = await telegramRequest("getChats", args)
            if (!res.success) return `✗ ${res.error}`
            return JSON.stringify(res.data, null, 2)
          } catch (e) {
            return `✗ ${(e as Error).message}`
          }
        },
      }),

      telegramGetMessages: tool({
        description: "Get messages from a Telegram chat",
        args: {
          chatId: z.string().describe("Chat ID"),
          limit: z.number().default(10).describe("Max number of messages to return"),
        },
        async execute(args): Promise<string> {
          try {
            const res = await telegramRequest("getMessages", args)
            if (!res.success) return `✗ ${res.error}`
            return JSON.stringify(res.data, null, 2)
          } catch (e) {
            return `✗ ${(e as Error).message}`
          }
        },
      }),

      telegramGetChatInfo: tool({
        description: "Get info about a Telegram chat",
        args: {
          chatId: z.string().describe("Chat ID"),
        },
        async execute(args): Promise<string> {
          try {
            const res = await telegramRequest("getChatInfo", args)
            if (!res.success) return `✗ ${res.error}`
            return JSON.stringify(res.data, null, 2)
          } catch (e) {
            return `✗ ${(e as Error).message}`
          }
        },
      }),
    },
  }
}
