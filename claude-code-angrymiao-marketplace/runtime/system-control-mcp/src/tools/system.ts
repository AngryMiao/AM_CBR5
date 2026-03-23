import { execSync } from 'child_process'
import open from 'open'
import {
  getLockScreenCommand,
  getLockScreenFallbackCommands,
  getPlatform,
  getRestartCommand,
  getShutdownCommand,
  getSleepCommand,
} from '../utils/platform'

export type SystemCommandType = 'shutdown' | 'restart' | 'sleep' | 'lock-screen' | 'open-browser'

const PLATFORM_LABELS = {
  darwin: 'macOS',
  win32: 'Windows',
  linux: 'Linux',
} as const

const BROWSER_APP_NAMES = {
  chrome: {
    darwin: 'Google Chrome',
    win32: 'chrome',
    linux: 'google-chrome',
  },
  firefox: {
    darwin: 'Firefox',
    win32: 'firefox',
    linux: 'firefox',
  },
  edge: {
    darwin: 'Microsoft Edge',
    win32: 'msedge',
    linux: 'microsoft-edge',
  },
  safari: {
    darwin: 'Safari',
  },
} as const

type SupportedBrowser = keyof typeof BROWSER_APP_NAMES

export function resolveBrowserLaunchTarget(
  browser?: string,
  platform = getPlatform()
) {
  const normalizedBrowser = browser?.trim().toLowerCase() as SupportedBrowser | undefined
  if (!normalizedBrowser) {
    return {}
  }

  const appNames = BROWSER_APP_NAMES[normalizedBrowser]
  if (!appNames) {
    return {
      error: `不支持的浏览器: ${browser}`,
    }
  }

  const appName = appNames[platform]
  if (!appName) {
    return {
      error: `${normalizedBrowser} 在 ${PLATFORM_LABELS[platform]} 上不受支持`,
    }
  }

  return {
    appName,
    displayName: normalizedBrowser === 'edge' ? 'Edge' : appName,
  }
}

export async function executeSystemCommand(
  command: SystemCommandType,
  options?: { url?: string; browser?: string }
): Promise<{ success: boolean; message: string }> {
  try {
    switch (command) {
      case 'shutdown': {
        execSync(getShutdownCommand(), { timeout: 5000 })
        return { success: true, message: '系统正在关机...' }
      }
      case 'restart': {
        execSync(getRestartCommand(), { timeout: 5000 })
        return { success: true, message: '系统正在重启...' }
      }
      case 'sleep': {
        execSync(getSleepCommand(), { timeout: 5000 })
        return { success: true, message: '系统正在进入睡眠...' }
      }
      case 'lock-screen': {
        const commands = [getLockScreenCommand(), ...getLockScreenFallbackCommands()]
        const errors: string[] = []

        for (const candidate of commands) {
          try {
            execSync(candidate, { timeout: 5000 })
            return { success: true, message: '屏幕已锁定' }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            errors.push(`${candidate}: ${message}`)
          }
        }

        return {
          success: false,
          message: `锁屏失败，已尝试 ${commands.length} 种方式。${errors.join(' | ')}`,
        }
      }
      case 'open-browser': {
        const url = options?.url || 'https://www.google.com'
        const browserTarget = resolveBrowserLaunchTarget(options?.browser)
        if (browserTarget.error) {
          return { success: false, message: browserTarget.error }
        }
        if (browserTarget.appName) {
          await open(url, { app: { name: browserTarget.appName } })
          return { success: true, message: `已在 ${browserTarget.displayName} 中打开: ${url}` }
        }
        await open(url)
        return { success: true, message: `已在浏览器中打开: ${url}` }
      }
      default:
        return { success: false, message: `未知命令: ${command}` }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { success: false, message: `命令执行失败: ${message}` }
  }
}
