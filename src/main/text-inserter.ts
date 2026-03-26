/**
 * 文字插入服务
 * 将文字插入到当前活动的应用程序中
 */

import { exec } from 'child_process'
import { clipboard } from 'electron'
import { promisify } from 'util'

const execAsync = promisify(exec)

/**
 * 模拟键盘粘贴操作
 * Windows: 使用 PowerShell
 * macOS: 使用 osascript
 */
async function simulatePaste(): Promise<void> {
  const platform = process.platform

  if (platform === 'win32') {
    // Windows: 使用 PowerShell 发送 Ctrl+V
    await execAsync(
      'powershell -command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait(\\"^v\\")"'
    )
  } else if (platform === 'darwin') {
    // macOS: 使用 osascript 发送 Cmd+V
    await execAsync('osascript -e \'tell application "System Events" to keystroke "v" using command down\'')
  } else {
    // Linux: 使用 xdotool (需要安装)
    await execAsync('xdotool key ctrl+v')
  }
}

/**
 * 将文本插入到当前活动应用程序
 * 使用剪贴板 + 粘贴的方式实现
 */
export async function insertTextToActiveApp(text: string): Promise<{ success: boolean; error?: string }> {
  if (!text || !text.trim()) {
    return { success: false, error: '文本为空' }
  }

  try {
    // 保存原剪贴板内容
    let originalClipboard = ''
    try {
      originalClipboard = clipboard.readText() || ''
    } catch {
      // 剪贴板可能为空或不可读
    }

    // 写入新文本到剪贴板
    clipboard.writeText(text)

    // 等待剪贴板更新
    await new Promise((resolve) => setTimeout(resolve, 50))

    // 模拟粘贴
    await simulatePaste()

    // 延迟恢复原剪贴板内容
    setTimeout(() => {
      try {
        clipboard.writeText(originalClipboard)
      } catch {
        // 忽略恢复失败
      }
    }, 200)

    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { success: false, error: message }
  }
}

/**
 * 检查当前平台是否支持文字插入
 */
export function isTextInsertionSupported(): boolean {
  const platform = process.platform
  return platform === 'win32' || platform === 'darwin' || platform === 'linux'
}
