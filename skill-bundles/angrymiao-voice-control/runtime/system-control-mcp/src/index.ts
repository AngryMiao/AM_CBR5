import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { keyboardControl, typeText } from './tools/keyboard'
import { executeSystemCommand } from './tools/system'

const DRIVER_PATH = process.env.KEYBOARD_DRIVER_PATH || ''

const server = new McpServer({
  name: 'system-control',
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
    description: '在当前光标位置输入文本。适用于：用户要求输入文字、填写表单、在编辑器中写内容等场景。',
    inputSchema: z.object({
      text: z.string().describe('要输入的文本内容'),
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
    description: '通过 driver.exe 执行键盘控制操作，如按下快捷键、组合键等。使用 8 位 hex key codes 序列，按下和抬起成对出现。',
    inputSchema: z.object({
      keyCodes: z.array(z.string()).describe('按键序列，8位hex码（XXYYYYYY），按下和抬起成对出现'),
    }),
  },
  async ({ keyCodes }) => {
    if (!DRIVER_PATH) {
      return {
        content: [
          {
            type: 'text',
            text: '错误：键盘驱动路径未配置。请先为 skill runtime 配置 KEYBOARD_DRIVER_PATH。',
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
    description: '关闭计算机。执行前会提示用户确认。',
    inputSchema: z.object({
      confirmed: z.boolean().describe('用户是否已确认关机操作'),
    }),
  },
  async ({ confirmed }) => {
    if (!confirmed) {
      return {
        content: [{ type: 'text', text: '关机操作需要用户确认。请告知用户并等待确认。' }],
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
    description: '重启计算机。执行前会提示用户确认。',
    inputSchema: z.object({
      confirmed: z.boolean().describe('用户是否已确认重启操作'),
    }),
  },
  async ({ confirmed }) => {
    if (!confirmed) {
      return {
        content: [{ type: 'text', text: '重启操作需要用户确认。请告知用户并等待确认。' }],
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
    description: '锁定屏幕。',
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
    description: '使计算机进入睡眠模式。',
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
    description: '在浏览器中打开指定 URL。适用于：用户要求打开网页、搜索内容等场景。可指定浏览器，不指定则使用默认浏览器。',
    inputSchema: z.object({
      url: z.string().url().describe('要打开的 URL，必须包含协议（如 https://）'),
      browser: z
        .enum(['chrome', 'firefox', 'safari', 'edge'])
        .optional()
        .describe('指定浏览器：chrome / firefox / edge；safari 仅 macOS 支持。不填则使用系统默认浏览器'),
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
  console.error('Angrymiao skill system-control runtime started')
}

main().catch((error) => {
  console.error('Failed to start skill runtime:', error)
  process.exit(1)
})
