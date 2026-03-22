import { execSync } from 'child_process'
import open from 'open'
import { getLockScreenCommand, getRestartCommand, getShutdownCommand, getSleepCommand } from '../utils/platform'

export type SystemCommandType = 'shutdown' | 'restart' | 'sleep' | 'lock-screen' | 'open-browser'

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
        execSync(getLockScreenCommand(), { timeout: 5000 })
        return { success: true, message: '屏幕已锁定' }
      }
      case 'open-browser': {
        const url = options?.url || 'https://www.google.com'
        const browserName = options?.browser?.toLowerCase()
        if (browserName) {
          await open(url, { app: { name: browserName } })
          return { success: true, message: `已在 ${options!.browser} 中打开: ${url}` }
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
