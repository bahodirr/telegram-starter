import { type Plugin, tool } from "@opencode-ai/plugin"
import { z } from "zod"

type SurgentConfig = {
  name?: string
  scripts?: {
    dev?: string | string[]
  }
}

export const SurgentDeployPlugin: Plugin = async ({ $, directory }) => {
  $.cwd(directory)

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
    },
  }
}
