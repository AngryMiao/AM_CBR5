import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { keyboardControl, typeText } from './tools/keyboard'
import { executeSystemCommand } from './tools/system'

const { resolveKeyboardRequest } = require('./tools/shortcut-mapping.cjs') as {
  resolveKeyboardRequest: (request: {
    action?: 'tap' | 'down' | 'up' | 'hold' | 'reset'
    shortcut?: string
    recordedKeys?: string[]
    keyCodes?: string[]
  }) => {
    action: 'tap' | 'down' | 'up' | 'hold' | 'reset'
    recordedKeys: string[]
    keyCodes: string[]
  }
}

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
    description:
      '通过 driver.exe 执行键盘控制操作，如按下快捷键、组合键等。优先传 shortcut 或 recordedKeys，必要时兼容 keyCodes。',
    inputSchema: z
      .object({
        action: z
          .enum(['tap', 'down', 'up', 'hold', 'reset'])
          .optional()
          .describe('键盘动作：tap=按下后抬起，down=仅按下，up=释放，hold=持续按住，reset=清除当前所有托管按键状态'),
        shortcut: z
          .string()
          .optional()
          .describe('规范化快捷键表达，例如 F5、Ctrl+S、Alt+Tab'),
        recordedKeys: z
          .array(z.string())
          .optional()
          .describe('标准按键数组，例如 ["ControlLeft", "KeyS"]'),
        keyCodes: z
          .array(z.string())
          .optional()
          .describe('按键序列，8位hex码（XXYYYYYY），按下和抬起成对出现'),
      })
      .refine(
        (value) =>
          value.action === 'reset' ||
          Boolean(
            value.shortcut?.trim() ||
              value.recordedKeys?.length ||
              value.keyCodes?.length
          ),
        {
          message:
            'keyboard_control 至少需要 shortcut、recordedKeys 或 keyCodes 之一；reset 动作除外。',
        }
      ),
  },
  async ({ action, shortcut, recordedKeys, keyCodes }) => {
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

    let resolved: {
      action: 'tap' | 'down' | 'up' | 'hold' | 'reset'
      recordedKeys: string[]
      keyCodes: string[]
    }
    try {
      resolved = resolveKeyboardRequest({ action, shortcut, recordedKeys, keyCodes })
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: error instanceof Error ? error.message : String(error),
          },
        ],
        isError: true,
      }
    }

    const result = await keyboardControl(DRIVER_PATH, resolved)
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

server.registerTool(
  'open_application',
  {
    description: '打开本地应用程序。适用于：用户要求打开某个软件，如微信、QQ、VSCode、Finder、计算器等场景。macOS 上使用应用名（如 "WeChat"、"Visual Studio Code"），Windows 上使用程序名（如 "notepad"、"calc"）。',
    inputSchema: z.object({
      appName: z.string().describe('应用程序名称。macOS: 应用名如 "WeChat"、"Safari"；Windows: 程序名如 "notepad"、"calc"；Linux: 命令名如 "firefox"'),
    }),
  },
  async ({ appName }) => {
    const result = await executeSystemCommand('open-application', { appName })
    assertExecutionSuccess(result)
    return {
      content: [{ type: 'text', text: result.message }],
      isError: false,
    }
  }
)

server.registerTool(
  'close_application',
  {
    description: '关闭正在运行的应用程序。适用于：用户要求关闭某个软件或浏览器等场景。会向应用发送退出请求（非强制终止）。macOS 上使用应用名（如 "Google Chrome"、"WeChat"），Windows 上使用进程名（如 "chrome.exe"、"notepad.exe"）。',
    inputSchema: z.object({
      appName: z.string().describe('要关闭的应用程序名称。macOS: 应用名如 "Google Chrome"、"Safari"；Windows: 进程名如 "chrome.exe"；Linux: 进程名如 "firefox"'),
    }),
  },
  async ({ appName }) => {
    const result = await executeSystemCommand('close-application', { appName })
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
