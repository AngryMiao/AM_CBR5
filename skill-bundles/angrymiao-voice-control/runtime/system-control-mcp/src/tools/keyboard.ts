import { execSync, spawn, spawnSync } from 'child_process'
import { isMacOS, isWindows } from '../utils/platform'
const { ensureKeyboardDriverWorkingDirectory } = require('./driver-runtime.cjs') as {
  ensureKeyboardDriverWorkingDirectory: () => string
}
const {
  clearKeyboardHeldKeys,
  loadKeyboardHeldKeys,
  saveKeyboardHeldKeys,
} = require('./driver-runtime.cjs') as {
  clearKeyboardHeldKeys: () => void
  loadKeyboardHeldKeys: () => string[]
  saveKeyboardHeldKeys: (keys: string[]) => void
}
const { planManagedKeyboardAction } = require('./managed-keys.cjs') as {
  planManagedKeyboardAction: (request: {
    action: KeyboardControlAction
    recordedKeys: string[]
    heldKeys: string[]
  }) => {
    effectiveAction: KeyboardControlAction
    effectiveRecordedKeys: string[]
    nextHeldKeys: string[]
    noop: boolean
  }
}
const { resolveKeyboardRequest } = require('./shortcut-mapping.cjs') as {
  resolveKeyboardRequest: (request: {
    action?: KeyboardControlAction
    shortcut?: string
    recordedKeys?: string[]
    keyCodes?: string[]
  }) => { action: KeyboardControlAction; recordedKeys: string[]; keyCodes: string[] }
}

type KeyboardControlAction = 'tap' | 'down' | 'up' | 'hold' | 'reset'

type KeyboardControlRequest = {
  action: KeyboardControlAction
  recordedKeys: string[]
  keyCodes: string[]
}

function runWindowsPowerShell(script: string) {
  const encodedCommand = Buffer.from(script, 'utf16le').toString('base64')
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodedCommand],
    {
      encoding: 'utf-8',
      timeout: 10000,
      windowsHide: true,
    }
  )

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `PowerShell exited with code ${result.status}`).trim())
  }
}

export async function typeText(text: string): Promise<{ success: boolean; message: string }> {
  try {
    if (isWindows()) {
      const escapedText = text.replace(/'/g, "''").replace(/[+^%~(){}[\]]/g, '{$&}')
      const script = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${escapedText}')`
      runWindowsPowerShell(script)
    } else if (isMacOS()) {
      let previousClipboard = ''
      try {
        previousClipboard = execSync('pbpaste', { encoding: 'utf-8', timeout: 5000 })
      } catch {
        // Clipboard may be empty or contain non-text content.
      }

      try {
        spawnSync('pbcopy', { input: text, encoding: 'utf-8', timeout: 5000 })
        await new Promise((resolve) => setTimeout(resolve, 50))
        execSync(`osascript -e 'tell application "System Events" to keystroke "v" using command down'`, {
          timeout: 10000,
        })
        await new Promise((resolve) => setTimeout(resolve, 200))
        try {
          spawnSync('pbcopy', {
            input: previousClipboard,
            encoding: 'utf-8',
            timeout: 5000,
          })
        } catch {
          // Restore failures should not block the main action.
        }
      } catch (error) {
        try {
          spawnSync('pbcopy', {
            input: previousClipboard,
            encoding: 'utf-8',
            timeout: 5000,
          })
        } catch {
          // Ignore clipboard restore failures during error handling.
        }
        throw error
      }
    } else {
      execSync(`xdotool type --clearmodifiers "${text}"`, { timeout: 10000 })
    }

    return { success: true, message: `成功输入文本: "${text}"` }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (isWindows()) {
      return {
        success: false,
        message:
          `输入文本失败：Windows 文本注入未成功。请确认目标窗口已聚焦、Chatbox 与目标应用权限级别一致，并且系统可用 powershell.exe。原始错误: ${message}`,
      }
    }
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

export async function keyboardControl(
  driverPath: string,
  request: KeyboardControlRequest
): Promise<{ success: boolean; message: string; output?: string }> {
  const action = request.action || 'tap'
  const normalizedRecordedKeys = request.recordedKeys
    .map((key) => key.trim())
    .filter(Boolean)
  let normalizedKeyCodes = request.keyCodes
    .map((keyCode) => keyCode.trim())
    .filter(Boolean)
  let nextHeldKeys = loadKeyboardHeldKeys()

  if (action === 'hold' || action === 'up' || action === 'reset') {
    const plan = planManagedKeyboardAction({
      action,
      recordedKeys: normalizedRecordedKeys,
      heldKeys: nextHeldKeys,
    })
    nextHeldKeys = plan.nextHeldKeys

    if (plan.noop) {
      persistKeyboardHeldKeys(nextHeldKeys)
      return { success: true, message: noopKeyboardActionMessage(action) }
    }

    const resolved = resolveKeyboardRequest({
      action: plan.effectiveAction,
      recordedKeys: plan.effectiveRecordedKeys,
    })
    normalizedKeyCodes = resolved.keyCodes
  }

  if (!driverPath) {
    return { success: false, message: 'driver.exe 路径未配置' }
  }

  if (!normalizedKeyCodes.length) {
    return { success: false, message: '未提供按键序列' }
  }

  return new Promise((resolve) => {
    try {
      const workingDirectory = ensureKeyboardDriverWorkingDirectory()
      const child = spawn(driverPath, ['-k', ...normalizedKeyCodes], {
        cwd: workingDirectory,
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
          if (action === 'hold' || action === 'up' || action === 'reset') {
            persistKeyboardHeldKeys(nextHeldKeys)
          }
          resolve({
            success: true,
            message: keyboardActionSuccessMessage(action, normalizedRecordedKeys, nextHeldKeys),
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

function persistKeyboardHeldKeys(keys: string[]) {
  if (keys.length === 0) {
    clearKeyboardHeldKeys()
    return
  }

  saveKeyboardHeldKeys(keys)
}

function keyboardActionSuccessMessage(
  action: KeyboardControlAction,
  recordedKeys: string[],
  nextHeldKeys: string[]
) {
  const label = recordedKeys.join('+') || nextHeldKeys.join('+')

  switch (action) {
    case 'hold':
      return label
        ? `已开始持续按住: ${label}`
        : '已开始持续按住指定按键'
    case 'down':
      return label ? `已按下按键: ${label}` : '已按下指定按键'
    case 'up':
      return label ? `已释放按键: ${label}` : '已释放指定按键'
    case 'reset':
      return '已清除当前所有托管按键状态。'
    default:
      return label ? `已点击按键: ${label}` : '键盘控制执行成功'
  }
}

function noopKeyboardActionMessage(action: KeyboardControlAction) {
  switch (action) {
    case 'hold':
      return '指定按键已经处于持续按住状态。'
    case 'reset':
      return '当前没有托管按键需要清除。'
    default:
      return '当前无需更新按键状态。'
  }
}
