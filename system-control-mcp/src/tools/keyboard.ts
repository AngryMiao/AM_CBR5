import { execSync, spawn, spawnSync } from 'child_process'
import { isWindows, isMacOS } from '../utils/platform'

/**
 * 在光标处输入文本
 * 使用平台特定的方法模拟键盘输入
 */
export async function typeText(text: string): Promise<{ success: boolean; message: string }> {
  try {
    if (isWindows()) {
      // Windows: 使用 PowerShell 的 SendKeys
      const escapedText = text.replace(/'/g, "''").replace(/[+^%~(){}[\]]/g, '{$&}')
      const script = `
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.SendKeys]::SendWait('${escapedText}')
      `
      execSync(`powershell -Command "${script}"`, { timeout: 10000 })
    } else if (isMacOS()) {
      // macOS: 使用剪贴板 + 粘贴方案，支持 Unicode/中文字符
      // keystroke 只能模拟物理按键，无法输入中文
      let previousClipboard = ''
      try {
        previousClipboard = execSync('pbpaste', { encoding: 'utf-8', timeout: 5000 })
      } catch {
        // 剪贴板可能为空或包含非文本数据
      }

      try {
        // 通过 stdin 传递文本给 pbcopy，避免 shell 转义问题
        spawnSync('pbcopy', { input: text, encoding: 'utf-8', timeout: 5000 })

        // 添加短暂延迟确保剪贴板已更新
        await new Promise((resolve) => setTimeout(resolve, 50))

        // 模拟 Cmd+V 粘贴
        execSync(
          `osascript -e 'tell application "System Events" to keystroke "v" using command down'`,
          { timeout: 10000 }
        )

        // 等待粘贴完成后恢复剪贴板
        await new Promise((resolve) => setTimeout(resolve, 200))
        try {
          spawnSync('pbcopy', {
            input: previousClipboard,
            encoding: 'utf-8',
            timeout: 5000,
          })
        } catch {
          // 恢复失败不影响主流程
        }
      } catch (error) {
        // 粘贴失败时也尝试恢复剪贴板
        try {
          spawnSync('pbcopy', {
            input: previousClipboard,
            encoding: 'utf-8',
            timeout: 5000,
          })
        } catch {
          // ignore
        }
        throw error
      }
    } else {
      // Linux: 使用 xdotool
      execSync(`xdotool type --clearmodifiers "${text}"`, { timeout: 10000 })
    }

    return { success: true, message: `成功输入文本: "${text}"` }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (isMacOS()) {
      const lowerMessage = message.toLowerCase()
      if (
        lowerMessage.includes('not authorized') ||
        lowerMessage.includes('not permitted') ||
        lowerMessage.includes('osascript')
      ) {
        return {
          success: false,
          message:
            '输入文本失败：缺少 macOS 自动化/辅助功能权限。请在 系统设置 -> 隐私与安全性 中为 Chatbox 授权「辅助功能」和「自动化 -> System Events」，然后重启 Chatbox。',
        }
      }
    }
    return { success: false, message: `输入文本失败: ${message}` }
  }
}

/**
 * 使用 driver.exe 执行键盘控制
 * 调用格式: driver.exe -k <code1> <code2> ...
 * 每个 code 为 8 位 hex：XXYYYYYY
 */
export async function keyboardControl(
  driverPath: string,
  keyCodes: string[]
): Promise<{ success: boolean; message: string; output?: string }> {
  if (!driverPath) {
    return { success: false, message: 'driver.exe 路径未配置' }
  }

  if (!keyCodes.length) {
    return { success: false, message: '未提供按键序列' }
  }

  return new Promise((resolve) => {
    try {
      const child = spawn(driverPath, ['-k', ...keyCodes], {
        timeout: 30000,
        windowsHide: true,
      })

      let stdout = ''
      let stderr = ''

      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString()
      })

      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString()
      })

      child.on('close', (code: number | null) => {
        if (code === 0) {
          resolve({
            success: true,
            message: `键盘控制执行成功`,
            output: stdout.trim(),
          })
        } else {
          resolve({
            success: false,
            message: `键盘控制执行失败 (exit code: ${code}): ${stderr.trim()}`,
          })
        }
      })

      child.on('error', (error: Error) => {
        resolve({
          success: false,
          message: `无法执行 driver.exe: ${error.message}`,
        })
      })
    } catch (error) {
      resolve({
        success: false,
        message: `执行失败: ${error instanceof Error ? error.message : String(error)}`,
      })
    }
  })
}
