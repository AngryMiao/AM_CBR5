import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { keyboardControl, typeText } from './tools/keyboard'
import { executeSystemCommand } from './tools/system'

const DRIVER_PATH = process.env.KEYBOARD_DRIVER_PATH || ''

const server = new McpServer({
  name: 'angrymiao-system-control',
  version: '1.0.0',
})

function assertExecutionSuccess(result: { success: boolean; message: string }) {
  if (!result.success) {
    throw new Error(result.message)
  }
}

server.registerTool(
  'type_text',
  {
    description: 'Type text at the current cursor location.',
    inputSchema: z.object({
      text: z.string().describe('The text to type'),
    }),
  },
  async ({ text }) => {
    const result = await typeText(text)
    assertExecutionSuccess(result)
    return {
      content: [{ type: 'text', text: result.message }],
      isError: false,
    }
  }
)

server.registerTool(
  'keyboard_control',
  {
    description: 'Run keyboard shortcuts using a configured native keyboard driver.',
    inputSchema: z.object({
      keyCodes: z.array(z.string()).describe('A sequence of 8-digit hex key codes'),
    }),
  },
  async ({ keyCodes }) => {
    if (!DRIVER_PATH) {
      return {
        content: [
          {
            type: 'text',
            text: '错误：键盘驱动路径未配置。请先为 Claude Code 环境配置 KEYBOARD_DRIVER_PATH。',
          },
        ],
        isError: true,
      }
    }

    const result = await keyboardControl(DRIVER_PATH, keyCodes)
    assertExecutionSuccess(result)
    return {
      content: [
        {
          type: 'text',
          text: result.output ? `${result.message}\n输出: ${result.output}` : result.message,
        },
      ],
      isError: false,
    }
  }
)

server.registerTool(
  'system_shutdown',
  {
    description: 'Shut down the computer. Requires confirmation.',
    inputSchema: z.object({
      confirmed: z.boolean().describe('Whether the user has already confirmed shutdown'),
    }),
  },
  async ({ confirmed }) => {
    if (!confirmed) {
      return {
        content: [{ type: 'text', text: '关机操作需要用户确认。请先征求确认。' }],
        isError: false,
      }
    }

    const result = await executeSystemCommand('shutdown')
    assertExecutionSuccess(result)
    return {
      content: [{ type: 'text', text: result.message }],
      isError: false,
    }
  }
)

server.registerTool(
  'system_restart',
  {
    description: 'Restart the computer. Requires confirmation.',
    inputSchema: z.object({
      confirmed: z.boolean().describe('Whether the user has already confirmed restart'),
    }),
  },
  async ({ confirmed }) => {
    if (!confirmed) {
      return {
        content: [{ type: 'text', text: '重启操作需要用户确认。请先征求确认。' }],
        isError: false,
      }
    }

    const result = await executeSystemCommand('restart')
    assertExecutionSuccess(result)
    return {
      content: [{ type: 'text', text: result.message }],
      isError: false,
    }
  }
)

server.registerTool(
  'system_lock_screen',
  {
    description: 'Lock the screen.',
    inputSchema: z.object({}),
  },
  async () => {
    const result = await executeSystemCommand('lock-screen')
    assertExecutionSuccess(result)
    return {
      content: [{ type: 'text', text: result.message }],
      isError: false,
    }
  }
)

server.registerTool(
  'system_sleep',
  {
    description: 'Put the computer to sleep.',
    inputSchema: z.object({}),
  },
  async () => {
    const result = await executeSystemCommand('sleep')
    assertExecutionSuccess(result)
    return {
      content: [{ type: 'text', text: result.message }],
      isError: false,
    }
  }
)

server.registerTool(
  'open_browser',
  {
    description: 'Open a URL in a browser.',
    inputSchema: z.object({
      url: z.string().url().describe('The URL to open, including protocol'),
      browser: z
        .enum(['chrome', 'firefox', 'safari', 'edge'])
        .optional()
        .describe('Optional browser name. Safari is only supported on macOS.'),
    }),
  },
  async ({ url, browser }) => {
    const result = await executeSystemCommand('open-browser', { url, browser })
    assertExecutionSuccess(result)
    return {
      content: [{ type: 'text', text: result.message }],
      isError: false,
    }
  }
)

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('Angrymiao Claude Code system-control runtime started')
}

main().catch((error) => {
  console.error('Failed to start Claude Code system-control runtime:', error)
  process.exit(1)
})
